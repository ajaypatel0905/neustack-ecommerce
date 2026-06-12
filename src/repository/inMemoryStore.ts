import { Cart, DiscountCode, Order, Product } from '../domain/types';
import { Store } from './store';

/**
 * In-memory implementation of {@link Store}, backed by plain Maps/arrays.
 *
 * Everything lives in process memory and is lost on restart — exactly what the
 * assignment permits. Because each method is synchronous and does no awaiting,
 * a full service operation runs to completion before the event loop can start
 * another, giving us atomicity for free (see Store docs / DECISIONS.md).
 */
export class InMemoryStore implements Store {
  private readonly products = new Map<string, Product>();
  private readonly carts = new Map<string, Cart>();
  private readonly orders: Order[] = [];
  private readonly discountCodes = new Map<string, DiscountCode>();
  private readonly idempotencyKeys = new Map<string, string>();

  constructor(seedProducts: Product[] = []) {
    for (const product of seedProducts) {
      this.products.set(product.id, product);
    }
  }

  getProduct(id: string): Product | undefined {
    return this.products.get(id);
  }

  listProducts(): Product[] {
    return [...this.products.values()];
  }

  saveCart(cart: Cart): void {
    this.carts.set(cart.id, cart);
  }

  getCart(id: string): Cart | undefined {
    return this.carts.get(id);
  }

  appendOrder(order: Order): void {
    this.orders.push(order);
  }

  listOrders(): Order[] {
    return [...this.orders];
  }

  orderCount(): number {
    return this.orders.length;
  }

  saveDiscountCode(code: DiscountCode): void {
    this.discountCodes.set(code.code, code);
  }

  getDiscountCode(code: string): DiscountCode | undefined {
    return this.discountCodes.get(code);
  }

  listDiscountCodes(): DiscountCode[] {
    return [...this.discountCodes.values()];
  }

  getOrderIdByIdempotencyKey(key: string): string | undefined {
    return this.idempotencyKeys.get(key);
  }

  recordIdempotencyKey(key: string, orderId: string): void {
    this.idempotencyKeys.set(key, orderId);
  }
}
