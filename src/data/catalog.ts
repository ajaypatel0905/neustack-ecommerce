import { Product } from '../domain/types';

/**
 * A small seed catalog. Prices are in cents. The assignment needs no real
 * product management, so this fixed list stands in for a catalog service.
 */
export const SEED_PRODUCTS: Product[] = [
  { id: 'p_tshirt', name: 'Cotton T-Shirt', priceCents: 1999 },
  { id: 'p_mug', name: 'Ceramic Mug', priceCents: 899 },
  { id: 'p_notebook', name: 'Hardcover Notebook', priceCents: 1250 },
  { id: 'p_pen', name: 'Gel Pen (Pack of 5)', priceCents: 499 },
  { id: 'p_bottle', name: 'Steel Water Bottle', priceCents: 2499 },
];
