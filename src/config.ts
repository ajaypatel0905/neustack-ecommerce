/**
 * Store configuration. Values are read once at startup from the environment
 * with sane defaults, so the reward rule can be tuned without code changes
 * (and tests can construct a service with explicit values directly).
 */
export interface StoreConfig {
  /** A coupon is earned for every Nth order. */
  readonly nthOrder: number;
  /** Percentage (0–100) the earned coupon discounts the order subtotal by. */
  readonly discountPercentage: number;
}

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer, got "${raw}"`);
  }
  return parsed;
}

export function loadConfig(): StoreConfig {
  const nthOrder = readPositiveInt('NTH_ORDER', 3);
  const discountPercentage = readPositiveInt('DISCOUNT_PERCENTAGE', 10);
  if (discountPercentage > 100) {
    throw new Error(`DISCOUNT_PERCENTAGE must be between 1 and 100, got ${discountPercentage}`);
  }
  return { nthOrder, discountPercentage };
}
