import {
  discountFor,
  entitledCodeCount,
  isCodeGenerationEligible,
} from '../../src/domain/discount';

describe('discount rules', () => {
  describe('entitledCodeCount', () => {
    it('earns one coupon per n orders', () => {
      expect(entitledCodeCount(0, 3)).toBe(0);
      expect(entitledCodeCount(2, 3)).toBe(0);
      expect(entitledCodeCount(3, 3)).toBe(1);
      expect(entitledCodeCount(6, 3)).toBe(2);
      expect(entitledCodeCount(7, 3)).toBe(2);
    });

    it('rejects an invalid n', () => {
      expect(() => entitledCodeCount(3, 0)).toThrow(RangeError);
      expect(() => entitledCodeCount(3, -1)).toThrow(RangeError);
      expect(() => entitledCodeCount(-1, 3)).toThrow(RangeError);
    });
  });

  describe('isCodeGenerationEligible', () => {
    it('is eligible when entitlement outruns issuance', () => {
      // 3 orders -> entitled to 1, 0 issued -> eligible
      expect(isCodeGenerationEligible(3, 0, 3)).toBe(true);
    });

    it('is not eligible before the next milestone', () => {
      expect(isCodeGenerationEligible(2, 0, 3)).toBe(false);
    });

    it('is not eligible once the earned coupon has been issued', () => {
      expect(isCodeGenerationEligible(3, 1, 3)).toBe(false);
    });

    it('re-opens eligibility at the next milestone', () => {
      expect(isCodeGenerationEligible(6, 1, 3)).toBe(true);
    });
  });

  describe('discountFor', () => {
    it('applies the percentage to a subtotal', () => {
      expect(discountFor(5000, 10)).toBe(500);
    });
  });
});
