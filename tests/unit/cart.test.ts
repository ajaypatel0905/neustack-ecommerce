import { addItem, createCart, itemCount, subtotalCents } from '../../src/domain/cart';
import { DomainError } from '../../src/domain/errors';
import { Product } from '../../src/domain/types';

const TSHIRT: Product = { id: 'p_tshirt', name: 'Cotton T-Shirt', priceCents: 1999 };
const MUG: Product = { id: 'p_mug', name: 'Ceramic Mug', priceCents: 899 };

describe('cart', () => {
  it('starts open and empty', () => {
    const cart = createCart('cart_1');
    expect(cart.status).toBe('OPEN');
    expect(itemCount(cart)).toBe(0);
    expect(subtotalCents(cart)).toBe(0);
  });

  it('adds items and computes totals', () => {
    const cart = createCart('cart_1');
    addItem(cart, TSHIRT, 2);
    addItem(cart, MUG, 1);
    expect(itemCount(cart)).toBe(3);
    expect(subtotalCents(cart)).toBe(1999 * 2 + 899);
  });

  it('merges quantity when the same product is added twice', () => {
    const cart = createCart('cart_1');
    addItem(cart, TSHIRT, 1);
    addItem(cart, TSHIRT, 2);
    expect(cart.items.size).toBe(1);
    expect(itemCount(cart)).toBe(3);
  });

  it('rejects a non-positive or non-integer quantity', () => {
    const cart = createCart('cart_1');
    expect(() => addItem(cart, TSHIRT, 0)).toThrow(DomainError);
    expect(() => addItem(cart, TSHIRT, -1)).toThrow(DomainError);
    expect(() => addItem(cart, TSHIRT, 1.5)).toThrow(DomainError);
  });

  it('refuses to add to a checked-out cart', () => {
    const cart = createCart('cart_1');
    cart.status = 'CHECKED_OUT';
    expect(() => addItem(cart, TSHIRT, 1)).toThrow(DomainError);
  });
});
