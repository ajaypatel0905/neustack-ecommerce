import { Cart, CartItem, Product } from './types';
import { Cents } from './money';
import { DomainError } from './errors';

/**
 * Pure cart operations (the "functional core"). These functions encode the
 * business rules of a cart without touching storage or transport. They mutate
 * the passed-in cart in place because a Cart is an aggregate owned by exactly
 * one caller (the service holds the single reference); keeping mutation local
 * and side-effect-free w.r.t. the outside world makes the rules trivial to
 * unit-test.
 */

export function createCart(id: string): Cart {
  return { id, status: 'OPEN', items: new Map<string, CartItem>() };
}

/** Total quantity of items across all lines. */
export function itemCount(cart: Cart): number {
  let count = 0;
  for (const item of cart.items.values()) {
    count += item.quantity;
  }
  return count;
}

/** Sum of every line (unit price × quantity), in cents. */
export function subtotalCents(cart: Cart): Cents {
  let subtotal = 0;
  for (const item of cart.items.values()) {
    subtotal += item.unitPriceCents * item.quantity;
  }
  return subtotal;
}

/**
 * Add a product to the cart. Adding a product that is already present
 * increments its quantity rather than creating a duplicate line — this is the
 * least-surprising behavior for an "add to cart" action and keeps totals
 * unambiguous.
 */
export function addItem(cart: Cart, product: Product, quantity: number): void {
  if (cart.status === 'CHECKED_OUT') {
    throw new DomainError('CART_ALREADY_CHECKED_OUT', `Cart ${cart.id} has already been checked out`);
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new DomainError('INVALID_QUANTITY', `Quantity must be a positive integer, got ${quantity}`);
  }

  const existing = cart.items.get(product.id);
  const nextQuantity = (existing?.quantity ?? 0) + quantity;

  cart.items.set(product.id, {
    productId: product.id,
    name: product.name,
    unitPriceCents: product.priceCents,
    quantity: nextQuantity,
  });
}
