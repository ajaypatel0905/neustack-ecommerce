import { StoreConfig } from '../config';
import { addItem, createCart, itemCount, subtotalCents } from '../domain/cart';
import { discountFor, entitledCodeCount, isCodeGenerationEligible } from '../domain/discount';
import { DomainError } from '../domain/errors';
import { Cents } from '../domain/money';
import { Cart, DiscountCode, Order, OrderLine, Product } from '../domain/types';
import { Store } from '../repository/store';
import { newCartId, newDiscountCode, newOrderId } from '../util/id';

export interface CheckoutOptions {
  /** Optional coupon code to validate and apply. */
  discountCode?: string;
  /**
   * Optional idempotency key. Replaying the same key returns the original
   * order instead of placing a second one — this is what stops a retried
   * request from double-counting an order or double-spending a coupon.
   */
  idempotencyKey?: string;
}

export interface StoreStats {
  totalOrders: number;
  totalItemsPurchased: number;
  /** Net amount actually charged to customers (subtotal minus discounts). */
  totalRevenueCents: Cents;
  totalSubtotalCents: Cents;
  totalDiscountCents: Cents;
  discountCodes: Array<{
    code: string;
    percentage: number;
    used: boolean;
    redeemedByOrderId?: string;
  }>;
}

/**
 * Application service: the single place that orchestrates the use cases the API
 * exposes. It composes the pure domain rules with the {@link Store} and owns
 * the invariants that span multiple entities — the global order sequence and
 * the single-use guarantee on coupons.
 *
 * Every public method runs synchronously end to end. Combined with the
 * in-memory store that means a checkout (read cart -> validate code -> append
 * order -> mark code used) executes without interleaving, so two concurrent
 * requests can't both consume the same coupon or claim the same order number.
 * See DECISIONS.md for how this would translate to a transactional datastore.
 */
export class StoreService {
  constructor(
    private readonly store: Store,
    private readonly config: StoreConfig,
  ) {}

  /** The public reward configuration (safe to expose to clients). */
  getConfig(): StoreConfig {
    return this.config;
  }

  listProducts(): Product[] {
    return this.store.listProducts();
  }

  createCart(): Cart {
    const cart = createCart(newCartId());
    this.store.saveCart(cart);
    return cart;
  }

  getCart(cartId: string): Cart {
    return this.requireCart(cartId);
  }

  addItemToCart(cartId: string, productId: string, quantity: number): Cart {
    const cart = this.requireCart(cartId);
    const product = this.store.getProduct(productId);
    if (!product) {
      throw new DomainError('PRODUCT_NOT_FOUND', `No product with id ${productId}`);
    }
    addItem(cart, product, quantity); // domain enforces quantity + open-cart rules
    this.store.saveCart(cart);
    return cart;
  }

  /**
   * Place an order from a cart, optionally applying a coupon. Validation runs
   * fully before any mutation, so a rejected checkout never burns an order
   * sequence number or a coupon.
   */
  checkout(cartId: string, options: CheckoutOptions = {}): Order {
    // 1. Idempotent replay: same key -> original order, no new side effects.
    if (options.idempotencyKey) {
      const existingId = this.store.getOrderIdByIdempotencyKey(options.idempotencyKey);
      if (existingId) {
        const existing = this.store.listOrders().find((o) => o.id === existingId);
        if (existing) return existing;
      }
    }

    const cart = this.requireCart(cartId);
    if (cart.status === 'CHECKED_OUT') {
      throw new DomainError('CART_ALREADY_CHECKED_OUT', `Cart ${cartId} has already been checked out`);
    }
    if (cart.items.size === 0) {
      throw new DomainError('EMPTY_CART', `Cart ${cartId} is empty`);
    }

    const subtotal = subtotalCents(cart);

    // 2. Validate the coupon (if any) BEFORE mutating anything.
    let appliedCode: DiscountCode | undefined;
    let discountCents = 0;
    if (options.discountCode) {
      appliedCode = this.validateDiscountCode(options.discountCode);
      discountCents = discountFor(subtotal, appliedCode.percentage);
    }

    // 3. Build the immutable order record.
    const order: Order = {
      id: newOrderId(),
      sequence: this.store.orderCount() + 1,
      lines: this.toOrderLines(cart),
      itemCount: itemCount(cart),
      subtotalCents: subtotal,
      ...(appliedCode ? { discountCode: appliedCode.code } : {}),
      discountCents,
      totalCents: subtotal - discountCents,
      createdAt: new Date().toISOString(),
    };

    // 4. Commit side effects together (synchronous = atomic here).
    if (appliedCode) {
      appliedCode.used = true;
      appliedCode.redeemedByOrderId = order.id;
      this.store.saveDiscountCode(appliedCode);
    }
    cart.status = 'CHECKED_OUT';
    this.store.saveCart(cart);
    this.store.appendOrder(order);
    if (options.idempotencyKey) {
      this.store.recordIdempotencyKey(options.idempotencyKey, order.id);
    }

    return order;
  }

  /**
   * Admin: mint a coupon if the store has earned one (entitlement from the
   * nth-order rule outruns the number of codes already issued). Throws
   * DISCOUNT_NOT_ELIGIBLE otherwise, with a message saying how many more orders
   * are needed.
   */
  generateDiscountCode(): DiscountCode {
    const totalOrders = this.store.orderCount();
    const issued = this.store.listDiscountCodes().length;

    if (!isCodeGenerationEligible(totalOrders, issued, this.config.nthOrder)) {
      const ordersUntilNext = this.config.nthOrder - (totalOrders % this.config.nthOrder);
      throw new DomainError(
        'DISCOUNT_NOT_ELIGIBLE',
        `Not eligible: ${totalOrders} order(s) placed, ${issued} code(s) issued. ` +
          `Need ${ordersUntilNext} more order(s) to earn the next coupon ` +
          `(1 coupon per ${this.config.nthOrder} orders).`,
      );
    }

    const milestone = entitledCodeCount(totalOrders, this.config.nthOrder);
    const code: DiscountCode = {
      code: newDiscountCode(this.config.discountPercentage),
      percentage: this.config.discountPercentage,
      orderSequenceIssuedFor: milestone * this.config.nthOrder,
      used: false,
    };
    this.store.saveDiscountCode(code);
    return code;
  }

  /** Admin: aggregate store stats. */
  getStats(): StoreStats {
    const orders = this.store.listOrders();
    const codes = this.store.listDiscountCodes();

    let totalItemsPurchased = 0;
    let totalSubtotalCents = 0;
    let totalDiscountCents = 0;
    let totalRevenueCents = 0;
    for (const order of orders) {
      totalItemsPurchased += order.itemCount;
      totalSubtotalCents += order.subtotalCents;
      totalDiscountCents += order.discountCents;
      totalRevenueCents += order.totalCents;
    }

    return {
      totalOrders: orders.length,
      totalItemsPurchased,
      totalRevenueCents,
      totalSubtotalCents,
      totalDiscountCents,
      discountCodes: codes.map((c) => ({
        code: c.code,
        percentage: c.percentage,
        used: c.used,
        ...(c.redeemedByOrderId ? { redeemedByOrderId: c.redeemedByOrderId } : {}),
      })),
    };
  }

  // --- internals ---

  private requireCart(cartId: string): Cart {
    const cart = this.store.getCart(cartId);
    if (!cart) {
      throw new DomainError('CART_NOT_FOUND', `No cart with id ${cartId}`);
    }
    return cart;
  }

  private validateDiscountCode(code: string): DiscountCode {
    const found = this.store.getDiscountCode(code);
    if (!found) {
      throw new DomainError('DISCOUNT_CODE_NOT_FOUND', `Discount code ${code} does not exist`);
    }
    if (found.used) {
      throw new DomainError('DISCOUNT_CODE_ALREADY_USED', `Discount code ${code} has already been used`);
    }
    return found;
  }

  private toOrderLines(cart: Cart): OrderLine[] {
    return [...cart.items.values()].map((item) => ({
      productId: item.productId,
      name: item.name,
      unitPriceCents: item.unitPriceCents,
      quantity: item.quantity,
      lineTotalCents: item.unitPriceCents * item.quantity,
    }));
  }
}
