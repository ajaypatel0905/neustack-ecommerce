/**
 * Money is represented throughout the domain as an integer number of cents.
 *
 * Rationale: floating-point arithmetic (e.g. `0.1 + 0.2 !== 0.3`) silently
 * corrupts currency math. By keeping every amount as an integer count of the
 * smallest currency unit we make all arithmetic exact, and only convert to a
 * human-readable decimal at the very edge (serialization). See DECISIONS.md.
 */

export type Cents = number;

/** Narrow guard: a valid money amount is a non-negative, safe integer. */
export function assertValidCents(value: number, label = 'amount'): asserts value is Cents {
  if (!Number.isInteger(value)) {
    throw new RangeError(`${label} must be an integer number of cents, got ${value}`);
  }
  if (value < 0) {
    throw new RangeError(`${label} must not be negative, got ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} exceeds the safe integer range`);
  }
}

/**
 * Apply a whole-number percentage discount to an amount of cents.
 *
 * We round half-up to the nearest cent. Rounding is unavoidable once a
 * percentage is involved (e.g. 10% of 999c = 99.9c); rounding the *discount*
 * down would over-charge the customer, so we round the discount to nearest and
 * document it. The result is clamped so a discount can never exceed the base.
 */
export function percentageOf(amount: Cents, percentage: number): Cents {
  assertValidCents(amount, 'amount');
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    throw new RangeError(`percentage must be between 0 and 100, got ${percentage}`);
  }
  const raw = Math.round((amount * percentage) / 100);
  return Math.min(raw, amount);
}

/** Format an integer cents value as a fixed 2-decimal string, e.g. 1999 -> "19.99". */
export function formatCents(amount: Cents): string {
  assertValidCents(amount);
  return (amount / 100).toFixed(2);
}
