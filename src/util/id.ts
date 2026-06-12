import { randomUUID } from 'node:crypto';

/**
 * ID generation is isolated behind these helpers so the rest of the code never
 * reaches for a global directly. That keeps call sites readable and gives us a
 * single place to swap the strategy (e.g. to ULIDs for sortability) later.
 */

export function newCartId(): string {
  return `cart_${randomUUID()}`;
}

export function newOrderId(): string {
  return `order_${randomUUID()}`;
}

/**
 * Human-friendly, unambiguous coupon code (no 0/O/1/I/L). Tied to the order
 * milestone it was issued for so codes read as e.g. SAVE10-3F7Q2K.
 */
export function newDiscountCode(percentage: number): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `SAVE${percentage}-${suffix}`;
}
