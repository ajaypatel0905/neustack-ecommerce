import { StoreConfig } from '../../src/config';
import { DomainError } from '../../src/domain/errors';
import { Product } from '../../src/domain/types';
import { InMemoryStore } from '../../src/repository/inMemoryStore';
import { StoreService } from '../../src/services/storeService';

const PRODUCTS: Product[] = [
  { id: 'p_tshirt', name: 'Cotton T-Shirt', priceCents: 1999 },
  { id: 'p_mug', name: 'Ceramic Mug', priceCents: 899 },
];

const CONFIG: StoreConfig = { nthOrder: 3, discountPercentage: 10 };

function freshService(config: StoreConfig = CONFIG): StoreService {
  return new StoreService(new InMemoryStore(PRODUCTS), config);
}

/** Place a complete order for a single product, returning the order. */
function placeOrder(service: StoreService, productId = 'p_tshirt', quantity = 1, discountCode?: string) {
  const cart = service.createCart();
  service.addItemToCart(cart.id, productId, quantity);
  return service.checkout(cart.id, discountCode ? { discountCode } : {});
}

describe('StoreService', () => {
  describe('cart + checkout', () => {
    it('places an order and assigns an incrementing sequence', () => {
      const service = freshService();
      const first = placeOrder(service);
      const second = placeOrder(service);
      expect(first.sequence).toBe(1);
      expect(second.sequence).toBe(2);
      expect(first.totalCents).toBe(1999);
    });

    it('throws when checking out a non-existent cart', () => {
      const service = freshService();
      expect(() => service.checkout('nope')).toThrow(DomainError);
    });

    it('throws when adding an unknown product', () => {
      const service = freshService();
      const cart = service.createCart();
      expect(() => service.addItemToCart(cart.id, 'ghost', 1)).toThrow(DomainError);
    });

    it('throws when checking out an empty cart', () => {
      const service = freshService();
      const cart = service.createCart();
      expect(() => service.checkout(cart.id)).toThrow(
        expect.objectContaining({ code: 'EMPTY_CART' }),
      );
    });

    it('throws when checking out the same cart twice', () => {
      const service = freshService();
      const cart = service.createCart();
      service.addItemToCart(cart.id, 'p_mug', 1);
      service.checkout(cart.id);
      expect(() => service.checkout(cart.id)).toThrow(
        expect.objectContaining({ code: 'CART_ALREADY_CHECKED_OUT' }),
      );
    });
  });

  describe('discount code generation (nth-order rule)', () => {
    it('is not eligible before n orders', () => {
      const service = freshService();
      placeOrder(service);
      placeOrder(service); // only 2 orders, n = 3
      expect(() => service.generateDiscountCode()).toThrow(
        expect.objectContaining({ code: 'DISCOUNT_NOT_ELIGIBLE' }),
      );
    });

    it('mints a coupon once the nth order is reached', () => {
      const service = freshService();
      placeOrder(service);
      placeOrder(service);
      placeOrder(service); // 3rd order
      const code = service.generateDiscountCode();
      expect(code.percentage).toBe(10);
      expect(code.orderSequenceIssuedFor).toBe(3);
      expect(code.used).toBe(false);
    });

    it('does not mint a second coupon until the next milestone', () => {
      const service = freshService();
      for (let i = 0; i < 3; i++) placeOrder(service);
      service.generateDiscountCode(); // claims milestone 3
      expect(() => service.generateDiscountCode()).toThrow(
        expect.objectContaining({ code: 'DISCOUNT_NOT_ELIGIBLE' }),
      );
      for (let i = 0; i < 3; i++) placeOrder(service); // now 6 orders
      expect(() => service.generateDiscountCode()).not.toThrow();
    });
  });

  describe('applying a discount at checkout', () => {
    it('applies the percentage and marks the code used', () => {
      const service = freshService();
      for (let i = 0; i < 3; i++) placeOrder(service);
      const code = service.generateDiscountCode();

      const order = placeOrder(service, 'p_tshirt', 1, code.code);
      expect(order.discountCode).toBe(code.code);
      expect(order.discountCents).toBe(200); // 10% of 1999 = 199.9 -> 200
      expect(order.totalCents).toBe(1799);
    });

    it('rejects an unknown code', () => {
      const service = freshService();
      const cart = service.createCart();
      service.addItemToCart(cart.id, 'p_tshirt', 1);
      expect(() => service.checkout(cart.id, { discountCode: 'NOPE' })).toThrow(
        expect.objectContaining({ code: 'DISCOUNT_CODE_NOT_FOUND' }),
      );
    });

    it('rejects a reused code', () => {
      const service = freshService();
      for (let i = 0; i < 3; i++) placeOrder(service);
      const code = service.generateDiscountCode();
      placeOrder(service, 'p_tshirt', 1, code.code); // first use

      const cart = service.createCart();
      service.addItemToCart(cart.id, 'p_mug', 1);
      expect(() => service.checkout(cart.id, { discountCode: code.code })).toThrow(
        expect.objectContaining({ code: 'DISCOUNT_CODE_ALREADY_USED' }),
      );
    });

    it('does not consume an order sequence when validation fails', () => {
      const service = freshService();
      const cart = service.createCart();
      service.addItemToCart(cart.id, 'p_tshirt', 1);
      expect(() => service.checkout(cart.id, { discountCode: 'NOPE' })).toThrow();
      // cart is still open and no order was recorded
      expect(service.getStats().totalOrders).toBe(0);
      const order = service.checkout(cart.id);
      expect(order.sequence).toBe(1);
    });
  });

  describe('idempotent checkout', () => {
    it('returns the original order on a replayed key without double-counting', () => {
      const service = freshService();
      const cart = service.createCart();
      service.addItemToCart(cart.id, 'p_tshirt', 1);

      const first = service.checkout(cart.id, { idempotencyKey: 'key-1' });
      const replay = service.checkout(cart.id, { idempotencyKey: 'key-1' });

      expect(replay.id).toBe(first.id);
      expect(service.getStats().totalOrders).toBe(1);
    });

    it('does not double-spend a coupon on a replayed checkout', () => {
      const service = freshService();
      for (let i = 0; i < 3; i++) placeOrder(service);
      const code = service.generateDiscountCode();

      const cart = service.createCart();
      service.addItemToCart(cart.id, 'p_tshirt', 1);
      const first = service.checkout(cart.id, { discountCode: code.code, idempotencyKey: 'k' });
      const replay = service.checkout(cart.id, { discountCode: code.code, idempotencyKey: 'k' });

      expect(replay.id).toBe(first.id);
      expect(replay.discountCents).toBe(200);
    });
  });

  describe('stats', () => {
    it('aggregates items, revenue and discounts', () => {
      const service = freshService();
      placeOrder(service, 'p_tshirt', 2); // 3998
      placeOrder(service, 'p_mug', 1); //   899
      for (let i = 0; i < 1; i++) placeOrder(service, 'p_mug', 1); // 3rd order -> 899
      const code = service.generateDiscountCode();
      placeOrder(service, 'p_tshirt', 1, code.code); // 1999 - 200 = 1799

      const stats = service.getStats();
      expect(stats.totalOrders).toBe(4);
      expect(stats.totalItemsPurchased).toBe(2 + 1 + 1 + 1);
      expect(stats.totalSubtotalCents).toBe(3998 + 899 + 899 + 1999);
      expect(stats.totalDiscountCents).toBe(200);
      expect(stats.totalRevenueCents).toBe(stats.totalSubtotalCents - 200);
      expect(stats.discountCodes).toHaveLength(1);
      expect(stats.discountCodes[0].used).toBe(true);
    });
  });
});
