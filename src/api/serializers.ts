import { formatCents } from '../domain/money';
import { Cart, Order, Product } from '../domain/types';
import { StoreStats } from '../services/storeService';

/**
 * Serializers translate internal domain objects into the JSON shape clients
 * see. They are the one place that converts integer cents into a human-readable
 * decimal string, and they hide internal representation choices (e.g. the cart's
 * Map) behind a stable API contract.
 *
 * Every monetary field is emitted twice: `*Cents` (the exact integer, for
 * programmatic use) and a formatted `*` string (for display). Clients should do
 * math on the cents.
 */

export function serializeProduct(p: Product): unknown {
  return {
    id: p.id,
    name: p.name,
    priceCents: p.priceCents,
    price: formatCents(p.priceCents),
  };
}

export function serializeCart(cart: Cart): unknown {
  const items = [...cart.items.values()].map((item) => ({
    productId: item.productId,
    name: item.name,
    unitPriceCents: item.unitPriceCents,
    unitPrice: formatCents(item.unitPriceCents),
    quantity: item.quantity,
    lineTotalCents: item.unitPriceCents * item.quantity,
    lineTotal: formatCents(item.unitPriceCents * item.quantity),
  }));
  const subtotalCents = items.reduce((sum, i) => sum + i.lineTotalCents, 0);
  return {
    id: cart.id,
    status: cart.status,
    items,
    subtotalCents,
    subtotal: formatCents(subtotalCents),
  };
}

export function serializeOrder(order: Order): unknown {
  return {
    id: order.id,
    sequence: order.sequence,
    lines: order.lines.map((l) => ({
      productId: l.productId,
      name: l.name,
      unitPriceCents: l.unitPriceCents,
      unitPrice: formatCents(l.unitPriceCents),
      quantity: l.quantity,
      lineTotalCents: l.lineTotalCents,
      lineTotal: formatCents(l.lineTotalCents),
    })),
    itemCount: order.itemCount,
    subtotalCents: order.subtotalCents,
    subtotal: formatCents(order.subtotalCents),
    discountCode: order.discountCode ?? null,
    discountCents: order.discountCents,
    discount: formatCents(order.discountCents),
    totalCents: order.totalCents,
    total: formatCents(order.totalCents),
    createdAt: order.createdAt,
  };
}

export function serializeStats(stats: StoreStats): unknown {
  return {
    totalOrders: stats.totalOrders,
    totalItemsPurchased: stats.totalItemsPurchased,
    totalRevenueCents: stats.totalRevenueCents,
    totalRevenue: formatCents(stats.totalRevenueCents),
    totalSubtotalCents: stats.totalSubtotalCents,
    totalSubtotal: formatCents(stats.totalSubtotalCents),
    totalDiscountCents: stats.totalDiscountCents,
    totalDiscount: formatCents(stats.totalDiscountCents),
    discountCodes: stats.discountCodes,
  };
}
