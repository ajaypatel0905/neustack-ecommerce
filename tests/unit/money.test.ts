import { assertValidCents, formatCents, percentageOf } from '../../src/domain/money';

describe('money', () => {
  describe('assertValidCents', () => {
    it('accepts non-negative safe integers', () => {
      expect(() => assertValidCents(0)).not.toThrow();
      expect(() => assertValidCents(1999)).not.toThrow();
    });

    it('rejects non-integers, negatives and unsafe integers', () => {
      expect(() => assertValidCents(19.99)).toThrow(RangeError);
      expect(() => assertValidCents(-1)).toThrow(RangeError);
      expect(() => assertValidCents(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
    });
  });

  describe('percentageOf', () => {
    it('computes a whole-cent discount', () => {
      expect(percentageOf(1000, 10)).toBe(100);
    });

    it('rounds half-up to the nearest cent', () => {
      // 10% of 999 = 99.9 -> 100
      expect(percentageOf(999, 10)).toBe(100);
      // 10% of 2499 = 249.9 -> 250
      expect(percentageOf(2499, 10)).toBe(250);
    });

    it('handles the 0% and 100% boundaries', () => {
      expect(percentageOf(5000, 0)).toBe(0);
      expect(percentageOf(5000, 100)).toBe(5000);
    });

    it('never exceeds the base amount', () => {
      expect(percentageOf(3, 100)).toBe(3);
    });

    it('rejects out-of-range percentages', () => {
      expect(() => percentageOf(1000, -1)).toThrow(RangeError);
      expect(() => percentageOf(1000, 101)).toThrow(RangeError);
    });
  });

  describe('formatCents', () => {
    it('formats integer cents as a 2-decimal string', () => {
      expect(formatCents(1999)).toBe('19.99');
      expect(formatCents(0)).toBe('0.00');
      expect(formatCents(5)).toBe('0.05');
    });
  });
});
