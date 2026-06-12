import { Cents } from './money';

/** A sellable product in the store catalog. Price is immutable cents. */
export interface Product {
  readonly id: string;
  readonly name: string;
  readonly priceCents: Cents;
}

/** A single line in a cart: a product plus a positive integer quantity. */
export interface CartItem {
  readonly productId: string;
  readonly name: string;
  readonly unitPriceCents: Cents;
  readonly quantity: number;
}

export type CartStatus = 'OPEN' | 'CHECKED_OUT';

export interface Cart {
  readonly id: string;
  status: CartStatus;
  /** Keyed by productId so repeated adds of the same product merge cleanly. */
  items: Map<string, CartItem>;
}

/**
 * A percentage discount coupon.
 *
 * Codes are store-wide and single-use: once redeemed at a successful checkout
 * they cannot be reused. `orderSequenceIssuedFor` records the nth-order
 * milestone that made this code eligible, which lets us reason about how many
 * codes *should* exist vs. how many have been issued.
 */
export interface DiscountCode {
  readonly code: string;
  readonly percentage: number;
  readonly orderSequenceIssuedFor: number;
  used: boolean;
  /** Set to the order id that redeemed this code, for auditability. */
  redeemedByOrderId?: string;
}

export interface OrderLine {
  readonly productId: string;
  readonly name: string;
  readonly unitPriceCents: Cents;
  readonly quantity: number;
  readonly lineTotalCents: Cents;
}

export interface Order {
  readonly id: string;
  /** 1-based position of this order in the global sequence (1st, 2nd, ...). */
  readonly sequence: number;
  readonly lines: readonly OrderLine[];
  readonly itemCount: number;
  readonly subtotalCents: Cents;
  readonly discountCode?: string;
  readonly discountCents: Cents;
  readonly totalCents: Cents;
  readonly createdAt: string;
}
