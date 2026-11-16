import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  amount,
  assetId,
  formatUnits,
  I128_MAX,
  I128_MIN,
  isAssetId,
  NATIVE_ASSET,
  negate,
  parseAssetId,
  parseUnits,
  protocolScale,
  StellarBooksValidationError,
  type AssetDescriptor,
} from '../src/index.js';
import { addressArb, gAddress } from './arbitraries.js';

const ISSUER = gAddress('ISSUER');

describe('assetId / parseAssetId', () => {
  it('builds canonical ids', () => {
    expect(assetId({ kind: 'native' })).toBe('native');
    expect(assetId({ kind: 'classic', code: 'USDC', issuer: ISSUER })).toBe(
      `classic:USDC:${ISSUER}`,
    );
    expect(assetId({ kind: 'pool', poolId: 'ab'.repeat(32) })).toBe(`pool:${'ab'.repeat(32)}`);
  });

  it('distinguishes the same code from different issuers', () => {
    const a = assetId({ kind: 'classic', code: 'USD', issuer: gAddress('ONE') });
    const b = assetId({ kind: 'classic', code: 'USD', issuer: gAddress('TWO') });
    expect(a).not.toBe(b);
  });

  it.each([
    ['empty code', { kind: 'classic', code: '', issuer: ISSUER }],
    ['13-char code', { kind: 'classic', code: 'ABCDEFGHIJKLM', issuer: ISSUER }],
    ['non-alphanumeric code', { kind: 'classic', code: 'US-D', issuer: ISSUER }],
    ['contract as issuer', { kind: 'classic', code: 'USD', issuer: 'C' + 'A'.repeat(55) }],
    ['uppercase pool id', { kind: 'pool', poolId: 'AB'.repeat(32) }],
    ['short pool id', { kind: 'pool', poolId: 'ab' }],
    ['account as sep41 contract', { kind: 'sep41', contract: ISSUER }],
  ] as [string, AssetDescriptor][])('rejects %s', (_name, descriptor) => {
    expect(() => assetId(descriptor)).toThrow(StellarBooksValidationError);
  });

  it.each(['', 'XLM', 'classic:USD', `classic:USD:${ISSUER}:x`, 'pool:', 'sep41:G', 'Native'])(
    'rejects id %j',
    (value) => {
      expect(isAssetId(value)).toBe(false);
      expect(() => parseAssetId(value)).toThrow(StellarBooksValidationError);
    },
  );

  it('round-trips every valid descriptor (property)', () => {
    const descriptorArb: fc.Arbitrary<AssetDescriptor> = fc.oneof(
      fc.constant({ kind: 'native' } as const),
      fc.record({
        kind: fc.constant('classic' as const),
        code: fc.stringMatching(/^[A-Za-z0-9]{1,12}$/),
        issuer: addressArb('G'),
      }),
      fc.record({
        kind: fc.constant('pool' as const),
        poolId: fc.stringMatching(/^[0-9a-f]{64}$/),
      }),
      fc.record({ kind: fc.constant('sep41' as const), contract: addressArb('C') }),
    );
    fc.assert(
      fc.property(descriptorArb, (d) => {
        expect(parseAssetId(assetId(d))).toEqual(d);
      }),
    );
  });

  it('reports protocol scale 7 for classic-family assets and none for SEP-41', () => {
    expect(protocolScale(NATIVE_ASSET)).toBe(7);
    expect(protocolScale(assetId({ kind: 'classic', code: 'USDC', issuer: ISSUER }))).toBe(7);
    expect(
      protocolScale(assetId({ kind: 'sep41', contract: 'C' + 'B'.repeat(55) })),
    ).toBeUndefined();
  });
});

describe('amount', () => {
  it('accepts the i128 bounds and rejects values outside them', () => {
    expect(amount(NATIVE_ASSET, I128_MAX).units).toBe(I128_MAX);
    expect(amount(NATIVE_ASSET, I128_MIN).units).toBe(I128_MIN);
    expect(() => amount(NATIVE_ASSET, I128_MAX + 1n)).toThrow(StellarBooksValidationError);
    expect(() => amount(NATIVE_ASSET, I128_MIN - 1n)).toThrow(StellarBooksValidationError);
  });

  it('negates exactly', () => {
    expect(negate(amount(NATIVE_ASSET, 5n))).toEqual({ asset: NATIVE_ASSET, units: -5n });
  });
});

describe('formatUnits / parseUnits', () => {
  it.each([
    [12345678n, 7, '1.2345678'],
    [-5n, 7, '-0.0000005'],
    [0n, 7, '0.0000000'],
    [922337203685477_5807n, 7, '922337203685.4775807'],
    [42n, 0, '42'],
  ])('formats %s at scale %s as %s', (units, scale, text) => {
    expect(formatUnits(units, scale)).toBe(text);
    expect(parseUnits(text, scale)).toBe(units);
  });

  it('parses short fractions and integers', () => {
    expect(parseUnits('1.5', 7)).toBe(15000000n);
    expect(parseUnits('10', 7)).toBe(100000000n);
    expect(parseUnits('-0.1', 2)).toBe(-10n);
  });

  it.each(['', '1.', '.5', '1e5', '1,5', ' 1', '+1', 'NaN', '0x10'])(
    'rejects malformed %j',
    (text) => {
      expect(() => parseUnits(text, 7)).toThrow(StellarBooksValidationError);
    },
  );

  it('rejects excess precision instead of rounding', () => {
    expect(() => parseUnits('0.00000001', 7)).toThrow(/more than 7 decimal places/);
  });

  it('rejects invalid scales', () => {
    expect(() => formatUnits(1n, -1)).toThrow(StellarBooksValidationError);
    expect(() => formatUnits(1n, 1.5)).toThrow(StellarBooksValidationError);
  });

  it('round-trips any bigint at any scale (property)', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: I128_MIN, max: I128_MAX }),
        fc.integer({ min: 0, max: 38 }),
        (units, scale) => {
          expect(parseUnits(formatUnits(units, scale), scale)).toBe(units);
        },
      ),
    );
  });
});
