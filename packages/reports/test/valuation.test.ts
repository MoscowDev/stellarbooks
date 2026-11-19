import { amount, assetId, NATIVE_ASSET } from '@stellarbooks/core';
import { describe, expect, it, vi } from 'vitest';
import { manualPriceSource, valueAmount, type PriceQuote } from '../src/index.js';

const quote = assetId({ kind: 'pool', poolId: 'a'.repeat(64) });
const asOf = '2026-11-18T00:00:00Z';
const price: PriceQuote = {
  base: NATIVE_ASSET,
  quote,
  numerator: 3n,
  denominator: 2n,
  observedAt: '2026-11-17T00:00:00Z',
  source: 'fixture:quote-1',
};

describe('offline valuation', () => {
  it('selects the newest eligible manual quote regardless of input order', async () => {
    const newer = { ...price, observedAt: asOf, source: 'fixture:quote-2' };
    const source = manualPriceSource([newer, price]);
    await expect(source.getQuote(NATIVE_ASSET, quote, asOf)).resolves.toEqual(newer);
    await expect(source.getQuote(NATIVE_ASSET, quote, price.observedAt)).resolves.toEqual(price);
    await expect(source.getQuote(quote, NATIVE_ASSET, asOf)).resolves.toBeNull();
    expect(() => manualPriceSource([price, price])).toThrow('Duplicate manual price observation');
  });
  it('values large amounts exactly and retains quote provenance', async () => {
    const source = { getQuote: vi.fn().mockResolvedValue(price) };
    const original = amount(NATIVE_ASSET, 9007199254740993n);
    const valuation = await valueAmount(original, quote, asOf, source, 'half-away-from-zero');
    expect(source.getQuote).toHaveBeenCalledWith(NATIVE_ASSET, quote, asOf);
    expect(valuation).toEqual({
      original,
      units: 13510798882111490n,
      price,
      asOf,
      rounding: 'half-away-from-zero',
    });
  });

  it('rounds negative half units according to the requested mode', async () => {
    const source = { getQuote: vi.fn().mockResolvedValue(price) };
    const original = amount(NATIVE_ASSET, -1n);
    await expect(valueAmount(original, quote, asOf, source, 'toward-zero')).resolves.toMatchObject({
      units: -1n,
    });
    await expect(
      valueAmount(original, quote, asOf, source, 'half-away-from-zero'),
    ).resolves.toMatchObject({
      units: -2n,
    });
  });

  it('returns null for missing quotes and rejects future quotes', async () => {
    const source = {
      getQuote: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          ...price,
          observedAt: '2026-11-19T00:00:00Z',
        }),
    };
    const original = amount(NATIVE_ASSET, 1n);
    await expect(valueAmount(original, quote, asOf, source, 'toward-zero')).resolves.toBeNull();
    await expect(valueAmount(original, quote, asOf, source, 'toward-zero')).rejects.toThrow(
      'Invalid price quote',
    );
  });
});
