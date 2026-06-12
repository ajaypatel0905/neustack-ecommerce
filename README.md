# Ecommerce Store API

![Node](https://img.shields.io/badge/node-%E2%89%A518-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![Tests](https://img.shields.io/badge/tests-47%20passing-4cd2a0)
![License](https://img.shields.io/badge/license-MIT-blue)

A backend for an ecommerce store with a reward-discount system: customers build a
cart and check out, and **every _n_-th order earns a coupon for _x_% off** that an
admin can mint and a customer can later redeem at checkout.

Built with **TypeScript + Express**, an **in-memory store** (no database required),
and a clean **layered architecture** so the business rules are isolated, testable,
and portable to a real datastore later. Ships with a small **demo storefront** (no
build step) so the whole flow can be exercised from a browser.

> The reasoning behind the notable design choices lives in **[DECISIONS.md](./DECISIONS.md)**.

---

## Architecture at a glance

```
HTTP ─▶ API layer        (Express routes, Zod validation, serializers, error→HTTP mapping)
        └─▶ Service layer (StoreService: orchestrates use cases, owns cross-entity invariants)
              ├─▶ Domain  (pure rules: money, cart, nth-order discount — no framework, no I/O)
              └─▶ Store    (interface)  ◀── InMemoryStore (swap for a DB = one class)
```

Dependencies point **inward**: the domain knows nothing about Express or storage, the
service depends only on the `Store` *interface*, and HTTP concerns live entirely in the
API layer. This is what makes the core logic easy to test in isolation and cheap to
re-platform.

```
src/
  domain/        money.ts · cart.ts · discount.ts · errors.ts · types.ts
  repository/    store.ts (interface) · inMemoryStore.ts
  services/      storeService.ts        ← the orchestration core
  api/           routes.ts · validation.ts · serializers.ts · errorHandler.ts · app.ts
  data/          catalog.ts (seed products)
  config.ts      env-driven reward rule
  index.ts       composition root (wires everything, starts the server)
tests/
  unit/          money · cart · discount · storeService · config
  integration/   api (supertest)
public/          index.html · styles.css · app.js  (framework-free demo client)
```

---

## Quick start

**Requirements:** Node ≥ 18.

```bash
npm install

# run the test suite (47 tests)
npm test
npm run test:coverage     # with a coverage report

# start the server (defaults: every 3rd order earns a 10% coupon, port 3000)
npm run dev               # hot-reload (ts-node-dev)
# or
npm run build && npm start
```

Then open **http://localhost:3000** for the demo storefront, or hit the API under
`/api` directly (curl / Postman).

> **One command runs everything.** The frontend and backend are the *same* process:
> Express serves the REST API under `/api` and the static demo client at `/` on a
> single port. There is no separate frontend server, no second terminal, and no
> frontend build step — `npm run dev` (or `npm start`) is all you need.

### Run with Docker

```bash
docker build -t neustack-ecommerce .
docker run -p 3000:3000 -e NTH_ORDER=3 -e DISCOUNT_PERCENTAGE=10 neustack-ecommerce
```

Configuration via environment variables (all optional):

| Variable              | Default | Meaning                                   |
| --------------------- | ------- | ----------------------------------------- |
| `PORT`                | `3000`  | HTTP port                                 |
| `NTH_ORDER`           | `3`     | A coupon is earned every _n_ orders       |
| `DISCOUNT_PERCENTAGE` | `10`    | Coupon discount percentage (1–100)        |

```bash
NTH_ORDER=5 DISCOUNT_PERCENTAGE=15 npm run dev
```

> **Money is always integer cents.** Every monetary field is returned twice — an exact
> `…Cents` integer (use this for math) and a formatted display string (e.g. `"19.99"`).

---

## API

Base path: `/api`. A ready-to-import **[Postman collection](./postman_collection.json)**
covers the full flow end to end.

| Method | Path                          | Purpose                                                       |
| ------ | ----------------------------- | ------------------------------------------------------------- |
| `GET`  | `/health`                     | Liveness check                                                |
| `GET`  | `/config`                     | The reward rule (`nthOrder`, `discountPercentage`)            |
| `GET`  | `/products`                   | List the seed catalog                                         |
| `POST` | `/carts`                      | Create an empty cart                                          |
| `GET`  | `/carts/:cartId`              | View a cart with line items and subtotal                      |
| `POST` | `/carts/:cartId/items`        | Add a product (repeat adds merge quantity)                    |
| `POST` | `/carts/:cartId/checkout`     | Place the order; optional `discountCode`; honors `Idempotency-Key` |
| `POST` | `/admin/discount-codes`       | Mint a coupon **if** the nth-order rule has earned one        |
| `GET`  | `/admin/stats`                | Items purchased, revenue, discounts, and all coupons          |

### Walkthrough (curl)

```bash
BASE=http://localhost:3000/api

# 1. Create a cart and add items
CART=$(curl -s -X POST $BASE/carts | jq -r .id)
curl -s -X POST $BASE/carts/$CART/items \
  -H 'Content-Type: application/json' \
  -d '{"productId":"p_tshirt","quantity":2}'

# 2. Check out (places the order)
curl -s -X POST $BASE/carts/$CART/checkout -H 'Content-Type: application/json' -d '{}'

# 3. After every Nth order, an admin can mint a coupon
curl -s -X POST $BASE/admin/discount-codes      # 409 until the rule is satisfied

# 4. Redeem the coupon on a later checkout
curl -s -X POST $BASE/carts/$CART2/checkout \
  -H 'Content-Type: application/json' \
  -d '{"discountCode":"SAVE10-AB7XQK"}'

# 5. Admin stats
curl -s $BASE/admin/stats
```

### Idempotent checkout

Send an `Idempotency-Key` header on `checkout`. Replaying the same key returns the
**original** order instead of placing a second one — so a retried/duplicated request
can never double-count an order or double-spend a coupon.

```bash
curl -X POST $BASE/carts/$CART/checkout -H 'Idempotency-Key: 7f3a…' -d '{}'
```

### Error contract

Every error returns the same envelope, and the domain's machine-readable `code` drives
the HTTP status:

```json
{ "error": { "code": "DISCOUNT_CODE_ALREADY_USED", "message": "Discount code … has already been used" } }
```

| Code                         | HTTP | When                                          |
| ---------------------------- | ---- | --------------------------------------------- |
| `VALIDATION_ERROR`           | 400  | Request body fails schema validation          |
| `CART_NOT_FOUND` / `PRODUCT_NOT_FOUND` / `DISCOUNT_CODE_NOT_FOUND` | 404 | Unknown id/code |
| `EMPTY_CART` / `INVALID_QUANTITY` | 422 | Semantically invalid request               |
| `CART_ALREADY_CHECKED_OUT` / `DISCOUNT_CODE_ALREADY_USED` / `DISCOUNT_NOT_ELIGIBLE` | 409 | Conflicts with current state |

---

## Demo storefront

A tiny single-page client lives in [`public/`](./public) and is served by the API at
`http://localhost:3000`. It is intentionally **framework-free vanilla JS with no build
step** — it just calls `/api` with `fetch`, and treats the server as the source of truth
(re-fetching the cart after each change rather than mirroring state). From it you can:

- browse the catalog and add items to a cart,
- check out (with or without a discount code),
- mint a coupon from the admin panel once the nth-order rule is satisfied,
- watch live stats (orders, items sold, revenue, discounts) update.

Frontend was optional for this assignment; it's included so the flow can be tested by
clicking rather than only via curl/Postman.

---

## How the discount rule works

The store accrues an **entitlement** as orders accumulate: it has earned
`floor(totalOrders / n)` coupons. The admin endpoint mints a coupon only while
entitlement exceeds the number of coupons already issued, so you can never mint more
coupons than milestones reached. Coupons are **store-wide and single-use**: redeeming
one at a successful checkout marks it spent. See [DECISIONS.md](./DECISIONS.md) for the
alternatives considered.

---

## Concurrency &amp; scaling

Two invariants must hold no matter how many customers act at once: the global order
**sequence** stays unique/contiguous, and a coupon is spent **at most once**.

**Within a single process — handled and tested.** Node runs JavaScript on one thread, and
every service operation here is fully synchronous (no `await` mid-method). So a checkout
runs *read cart → validate code → append order → mark coupon used* to completion before
the event loop can start another request. Two simultaneous checkouts therefore cannot
interleave to claim the same order number or redeem the same coupon twice — no locks
needed. Idempotency keys add a second layer: a retried/duplicated request returns the
original order instead of creating a new one. (`StoreService` and `Store` document this;
tests cover the double-spend and replay cases.)

**Across many processes — the honest limitation.** The in-memory store lives in *one*
process's heap, so you cannot simply run N instances behind a load balancer — each would
have its own carts, order counter, and coupons. The current build is deliberately
**single-node** (the assignment allows in-memory storage). What makes that acceptable is
that the path to real scale is already designed in:

| Concern at scale            | Where it plugs in (no business logic moves)                          |
| --------------------------- | -------------------------------------------------------------------- |
| Shared state across instances | Implement `Store` against Postgres/Redis — swap one class at the composition root |
| Atomic order sequence       | DB sequence / `INSERT … RETURNING`, or an atomic Redis `INCR`        |
| Single-use coupon (no double-spend) | A conditional update (`UPDATE … WHERE used = false`) or `SELECT … FOR UPDATE` in a transaction |
| Idempotency across instances | Persist the idempotency-key → order-id map in the shared store        |

Because the service depends only on the `Store` *interface*, moving from "correct on one
node" to "correct on many" is an implementation change behind that seam — the domain rules
and the API stay exactly as they are. That seam existing is the architectural answer to
"what about many concurrent users?"

---

## Testing

```bash
npm test            # 47 unit + integration tests
npm run test:coverage
npm run typecheck   # tsc --noEmit, strict mode
npm run lint
```

The domain and service layers — where all the business logic lives — sit at ~100%
coverage. Tests assert the rules directly (sequencing, eligibility, single-use coupons,
idempotency, rounding) rather than incidental wiring.
