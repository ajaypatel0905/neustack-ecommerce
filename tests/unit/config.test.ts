import { loadConfig } from '../../src/config';

describe('loadConfig', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('falls back to defaults when env vars are absent', () => {
    delete process.env.NTH_ORDER;
    delete process.env.DISCOUNT_PERCENTAGE;
    expect(loadConfig()).toEqual({ nthOrder: 3, discountPercentage: 10 });
  });

  it('reads valid overrides from the environment', () => {
    process.env.NTH_ORDER = '5';
    process.env.DISCOUNT_PERCENTAGE = '25';
    expect(loadConfig()).toEqual({ nthOrder: 5, discountPercentage: 25 });
  });

  it('rejects a non-positive integer', () => {
    process.env.NTH_ORDER = '0';
    expect(() => loadConfig()).toThrow();
  });

  it('rejects a percentage above 100', () => {
    process.env.DISCOUNT_PERCENTAGE = '150';
    expect(() => loadConfig()).toThrow();
  });
});
