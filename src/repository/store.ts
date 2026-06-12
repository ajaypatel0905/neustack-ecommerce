import { Cart, DiscountCode, Order, Product } from '../domain/types';

/**
 * Persistence boundary.
 *
 * The service layer depends on this interface, never on a concrete store. That
 * single seam is what lets us satisfy the assignment's "in-memory is fine"
 * constraint today while keeping a swap to Postgres/Redis a one-class change
 * tomorrow — no business logic moves. See DECISIONS.md.
 *
 * The interface is deliberately synchronous: the in-memory implementation has
 * no I/O, and Node's single-threaded execution model makes a sequence of
 * synchronous reads/writes effectively atomic (no interleaving mid-method).
 * That property is what we lean on for the order counter and single-use coupon
 * guarantees. A real datastore would make these async and move the atomicity
 * into a transaction; the interface shape would change but its callers would
 * not need new business logic.
 */
export interface Store {
  // --- Products (read-only catalog) ---
  getProduct(id: string): Product | undefined;
  listProducts(): Product[];

  // --- Carts ---
  saveCart(cart: Cart): void;
  getCart(id: string): Cart | undefined;

  // --- Orders ---
  /** Append an order and return the total number of orders after insertion. */
  appendOrder(order: Order): void;
  listOrders(): Order[];
  orderCount(): number;

  // --- Discount codes ---
  saveDiscountCode(code: DiscountCode): void;
  getDiscountCode(code: string): DiscountCode | undefined;
  listDiscountCodes(): DiscountCode[];

  // --- Idempotency ---
  /** Look up a previously-recorded order id for an idempotency key. */
  getOrderIdByIdempotencyKey(key: string): string | undefined;
  recordIdempotencyKey(key: string, orderId: string): void;
}
