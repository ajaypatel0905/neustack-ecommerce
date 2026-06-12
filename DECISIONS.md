# Design Decisions

This document records the decisions that shaped the codebase — what problem each
solved, the alternatives I weighed, what I chose, and why. The goal is to make the
*thinking* visible, not just the result.

---

## Decision: Layered architecture with dependency inversion

**Context:** The assignment permits an in-memory store "for now" but a real store
obviously needs a database eventually. I wanted the business rules to survive that
change untouched, and to be testable without spinning up HTTP or a DB.

**Options Considered:**
- **Option A:** Put logic directly in Express route handlers (fast to write).
- **Option B:** Layer the system — `domain` (pure rules) → `service` (orchestration) →
  `repository` (a `Store` *interface*) → `api` (HTTP) — with dependencies pointing inward.

**Choice:** Option B. The service depends on a `Store` interface; `InMemoryStore` is one
implementation, wired only at the composition root (`index.ts`).

**Why:** It isolates the parts that carry the real risk. The domain has zero imports from
Express or storage, so it's trivially unit-testable and re-usable. Swapping to Postgres is
a single new class plus a one-line change at the composition root — no business logic
moves. The cost is more files and a little ceremony, which is the right trade for a system
meant to grow and to be *reasoned about* by a reviewer.

---

## Decision: Represent money as integer cents

**Context:** Prices, subtotals, and percentage discounts all need exact arithmetic.
JavaScript numbers are IEEE-754 floats, where `0.1 + 0.2 !== 0.3` — a real source of
money bugs.

**Options Considered:**
- **Option A:** Store prices as decimal dollars (floats).
- **Option B:** A big-decimal library (e.g. `decimal.js`).
- **Option C:** Integer cents everywhere, format to a decimal string only at the edge.

**Choice:** Option C, behind a tiny `money` module (`assertValidCents`, `percentageOf`,
`formatCents`).

**Why:** Integers make addition and multiplication exact with no dependency. The only
place rounding is unavoidable is a percentage (10% of `999c` = `99.9c`); I round the
discount **half-up to the nearest cent** and clamp it so it can never exceed the base —
both decisions are documented in code and pinned by tests. A big-decimal lib would be
overkill for whole-cent currency. The API returns both the exact `…Cents` integer and a
formatted string so clients never do float math themselves.

---

## Decision: Model the reward as an *entitlement*, decoupled from minting

**Context:** "Every _n_-th order gets a coupon for _x_%," and there's a *separate* admin
API to generate the code. So order placement and code creation are distinct events — what
exactly makes a code generatable?

**Options Considered:**
- **Option A:** Auto-create a code inside checkout on every nth order.
- **Option B:** Let the admin mint a code anytime, unconditionally.
- **Option C:** Track an *entitlement*: the store has earned `floor(totalOrders / n)`
  coupons; the admin may mint one only while entitlement exceeds coupons already issued.

**Choice:** Option C.

**Why:** It honors the assignment's split between "place order" and the admin "generate"
endpoint, while making generation **safe and auditable** — you can't mint more coupons
than milestones reached, and the error message tells the admin exactly how many more
orders are needed. Option A ignores the dedicated admin endpoint; Option B violates the
"if the condition is satisfied" requirement. The entitlement framing also generalizes
cleanly (e.g. "issue all earned-but-unissued coupons") without reworking the model.

---

## Decision: Coupons are store-wide and single-use

**Context:** The brief doesn't define user accounts, scoping, or reuse semantics for a
coupon. I had to pick a coherent, defensible model.

**Options Considered:**
- **Option A:** Reusable codes (a percentage that anyone can apply repeatedly).
- **Option B:** Per-customer codes (requires a user/auth model the brief doesn't mention).
- **Option C:** Store-wide, single-use codes redeemed atomically at checkout.

**Choice:** Option C. A redeemed code is marked `used` and records the redeeming order id.

**Why:** Single-use matches the spirit of a *reward* (it's earned, then spent) and creates
the most interesting correctness constraint to get right — no double-spend, even under
retries. I deliberately avoided inventing a user model the assignment never asked for;
keeping codes store-wide keeps the scope honest while still exercising the hard part
(validation + atomic redemption). The `redeemedByOrderId` back-reference keeps it
auditable.

---

## Decision: Atomicity via synchronous critical sections (and a clear DB upgrade path)

**Context:** Two invariants span multiple entities: the global order **sequence** must be
unique/contiguous, and a coupon must be spent **at most once**. Concurrent checkouts must
not break either.

**Options Considered:**
- **Option A:** Sprinkle ad-hoc checks and hope interleavings don't bite.
- **Option B:** Add an in-process mutex/lock around checkout.
- **Option C:** Keep each service operation fully **synchronous** (no `await` mid-method)
  so Node's single-threaded event loop runs it to completion before any other request —
  giving atomicity for free — and validate *before* mutating.

**Choice:** Option C, with the reasoning written into the `Store` and `StoreService` docs.

**Why:** For an in-memory store with no I/O, synchronous execution is genuinely atomic, so
a lock would be theater. Validating before any mutation means a rejected checkout never
burns an order number or a coupon (there's a test for exactly this). I documented the
honest limitation: the moment the store does real async I/O, this guarantee disappears and
the same invariants must move into a **DB transaction / optimistic-locking** — which is why
the persistence seam is an interface. Naming the upgrade path matters more than pretending
the in-memory version scales.

---

## Decision: Idempotency-Key on checkout

**Context:** Checkout is the one non-idempotent, money-adjacent operation. Networks
retry; users double-click. A naive retry would place a second order and spend the coupon
twice.

**Options Considered:**
- **Option A:** Ignore it — out of scope for a take-home.
- **Option B:** Support an `Idempotency-Key` header; replaying a key returns the original
  order with no new side effects.

**Choice:** Option B (Stripe-style), backed by a key→orderId map in the store.

**Why:** It's a small amount of code that demonstrates how I think about real payment-path
correctness, and it composes with the single-use coupon rule (a replay returns the first
order rather than erroring on the now-spent code). It's optional, so simple clients are
unaffected. Tests cover both the plain replay and the replay-with-coupon case.

---

## Decision: Framework-agnostic error taxonomy, mapped to HTTP in one place

**Context:** Business rules need to signal failures (not found, conflict, invalid), but the
domain shouldn't know what an HTTP status code is.

**Options Considered:**
- **Option A:** Throw HTTP errors (status codes) from the service/domain.
- **Option B:** Return result objects / discriminated unions everywhere.
- **Option C:** Throw typed `DomainError`s carrying a stable string `code`; a single
  Express error handler maps each `code` → status and renders one error envelope.

**Choice:** Option C.

**Why:** It keeps the domain portable (the same errors would work behind gRPC, a queue
consumer, or a CLI) and makes the HTTP contract explicit and centralized — one table maps
codes to statuses, easy to audit. Result objects (Option B) are great but add ceremony at
every call site for little gain at this size; throwing HTTP from the domain (Option A)
leaks transport into the core, the exact coupling the architecture exists to avoid.

---

## Things I deliberately left out (and why)

- **No database / persistence:** explicitly allowed; the `Store` interface marks where it
  would attach.
- **No auth / user accounts:** not in the brief; coupons are store-wide instead.
- **No payment gateway:** checkout records the order and total; payment capture is a
  separate concern behind the same idempotency guarantee.

Each of these is a scope choice, not an oversight — kept out to keep the signal high on the
parts the assignment actually asked to see.
