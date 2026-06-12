import { Cents, percentageOf } from './money';

/**
 * The reward rule: "every nth order gets a coupon code for x% discount".
 *
 * We interpret this as an *entitlement* the store accrues as orders accumulate,
 * decoupled from the moment a code is actually minted (the assignment exposes a
 * separate admin endpoint to generate the code). So we track two quantities:
 *
 *   - how many codes the store is *entitled* to: floor(totalOrders / n)
 *   - how many codes have actually been *issued*
 *
 * A new code may be generated whenever entitlement outruns issuance. This keeps
 * generation idempotent-ish (you can't mint more codes than milestones reached)
 * and makes the rule auditable. See DECISIONS.md.
 */

/** How many coupons the store has earned given the total number of orders. */
export function entitledCodeCount(totalOrders: number, nthOrder: number): number {
  if (!Number.isInteger(nthOrder) || nthOrder <= 0) {
    throw new RangeError(`nthOrder must be a positive integer, got ${nthOrder}`);
  }
  if (totalOrders < 0) {
    throw new RangeError(`totalOrders must not be negative, got ${totalOrders}`);
  }
  return Math.floor(totalOrders / nthOrder);
}

/** True when a fresh coupon may be minted (entitlement exceeds what's issued). */
export function isCodeGenerationEligible(
  totalOrders: number,
  issuedCodeCount: number,
  nthOrder: number,
): boolean {
  return entitledCodeCount(totalOrders, nthOrder) > issuedCodeCount;
}

/** Compute the discount in cents for a given subtotal and percentage. */
export function discountFor(subtotalCents: Cents, percentage: number): Cents {
  return percentageOf(subtotalCents, percentage);
}
