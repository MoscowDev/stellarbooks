/**
 * Shared fast-check arbitraries and fixtures for core tests.
 * Addresses are structurally valid (prefix, length, base32 alphabet) but not checksummed, which
 * is all `core` checks (see src/address.ts).
 */
import fc from 'fast-check';
import {
  assetId,
  NATIVE_ASSET,
  ESCROW_ACTIONS,
  EXCHANGE_VIAS,
  TRANSFER_VIAS,
  type Amount,
  type AssetId,
  type EconomicEvent,
  type EconomicEventBase,
  type JournalEntry,
  type JournalLine,
  type SourcePosition,
} from '../src/index.js';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const base32Char = fc.constantFrom(...BASE32.split(''));

/** Arbitrary structurally-valid address with the given prefix and total length. */
export function addressArb(
  prefix: 'G' | 'C' | 'M',
  length = prefix === 'M' ? 69 : 56,
): fc.Arbitrary<string> {
  return fc
    .string({ unit: base32Char, minLength: length - 1, maxLength: length - 1 })
    .map((s) => prefix + s);
}

/** Deterministic structurally-valid account address for examples. */
export function gAddress(seed: string): string {
  return ('G' + seed.toUpperCase().replace(/[^A-Z2-7]/g, '') + 'A'.repeat(55)).slice(0, 56);
}

/** A small pool of tracked wallets so that internal transfers actually occur in generated data. */
export const WALLETS = [
  gAddress('WALLETONE'),
  gAddress('WALLETTWO'),
  gAddress('WALLETTHREE'),
] as const;
export const ISSUER = gAddress('ISSUER');

export const assetArb: fc.Arbitrary<AssetId> = fc.oneof(
  fc.constant(NATIVE_ASSET),
  fc
    .record({ code: fc.stringMatching(/^[A-Za-z0-9]{1,12}$/), issuer: addressArb('G') })
    .map((d) => assetId({ kind: 'classic', ...d })),
  fc.stringMatching(/^[0-9a-f]{64}$/).map((poolId) => assetId({ kind: 'pool', poolId })),
  addressArb('C').map((contract) => assetId({ kind: 'sep41', contract })),
);

/** A small fixed asset pool so that generated entries mix and repeat assets. */
export const ASSETS: readonly AssetId[] = [
  NATIVE_ASSET,
  assetId({ kind: 'classic', code: 'USDC', issuer: ISSUER }),
  assetId({ kind: 'classic', code: 'EURCOIN', issuer: ISSUER }),
];
export const smallAssetArb = fc.constantFrom(...ASSETS);

export const positiveUnitsArb = fc.bigInt({ min: 1n, max: 2n ** 63n - 1n });

export function positiveAmountArb(
  asset: fc.Arbitrary<AssetId> = smallAssetArb,
): fc.Arbitrary<Amount> {
  return fc.record({ asset, units: positiveUnitsArb });
}

const hashArb = fc.stringMatching(/^[0-9a-f]{64}$/);

export const sourceArb: fc.Arbitrary<SourcePosition> = fc
  .record({
    ledger: fc.integer({ min: 1, max: 4294967295 }),
    txIndex: fc.nat({ max: 500 }),
    txHash: hashArb,
    stage: fc.constantFrom<SourcePosition['stage']>('fee', 'operation', 'post_apply'),
    opIndex: fc.nat({ max: 99 }),
    eventIndex: fc.nat({ max: 9 }),
  })
  .map((r) => ({ network: 'testnet', ...r, opIndex: r.stage === 'operation' ? r.opIndex : null }));

const baseArb: fc.Arbitrary<EconomicEventBase> = fc.record({
  source: sourceArb,
  closeTime: fc
    .integer({ min: Date.UTC(2015, 0, 1), max: Date.UTC(2040, 0, 1) })
    .map((ms) => new Date(ms).toISOString()),
  wallet: fc.constantFrom(...WALLETS),
});

const counterpartyArb = fc.option(
  fc.oneof(fc.constantFrom(...WALLETS), addressArb('G'), addressArb('C')),
  { nil: undefined },
);

function withOptional<T extends object>(obj: T, key: string, value: unknown): T {
  return value === undefined ? obj : { ...obj, [key]: value };
}

/** Arbitrary valid economic event of any kind. */
export const eventArb: fc.Arbitrary<EconomicEvent> = fc.oneof(
  fc.tuple(baseArb, positiveUnitsArb).map(([b, units]): EconomicEvent => ({
    ...b,
    kind: 'fee',
    amount: { asset: NATIVE_ASSET, units },
  })),
  fc.tuple(baseArb, positiveUnitsArb).map(([b, units]): EconomicEvent => ({
    ...b,
    kind: 'fee_refund',
    amount: { asset: NATIVE_ASSET, units },
  })),
  fc
    .tuple(
      baseArb,
      fc.constantFrom<'in' | 'out'>('in', 'out'),
      positiveAmountArb(),
      counterpartyArb,
      fc.constantFrom(...TRANSFER_VIAS),
    )
    .map(([b, direction, amt, cp, via]): EconomicEvent =>
      withOptional({ ...b, kind: 'transfer', direction, amount: amt, via }, 'counterparty', cp),
    ),
  fc
    .tuple(
      baseArb,
      fc.uniqueArray(positiveAmountArb(), { minLength: 1, maxLength: 2, selector: (a) => a.asset }),
      fc.uniqueArray(positiveAmountArb(), { minLength: 1, maxLength: 2, selector: (a) => a.asset }),
      fc.constantFrom(...EXCHANGE_VIAS),
    )
    .map(([b, given, received, via]): EconomicEvent => ({
      ...b,
      kind: 'exchange',
      given,
      received,
      via,
    })),
  fc
    .tuple(
      baseArb,
      fc.constantFrom(...ESCROW_ACTIONS),
      positiveAmountArb(),
      fc.stringMatching(/^[0-9a-f]{72}$/),
      counterpartyArb,
    )
    .map(([b, action, amt, balanceId, cp]): EconomicEvent =>
      withOptional({ ...b, kind: 'escrow', action, amount: amt, balanceId }, 'counterparty', cp),
    ),
  fc
    .tuple(
      baseArb,
      smallAssetArb,
      fc.bigInt({ min: -(2n ** 63n), max: 2n ** 63n - 1n }).filter((u) => u !== 0n),
    )
    .map(([b, asset, units]): EconomicEvent => ({
      ...b,
      kind: 'unclassified_change',
      delta: { asset, units },
      reason: 'test',
    })),
);

/** Lines that balance per asset: for each asset, some random non-zero lines plus a balancing line. */
export const balancedLinesArb: fc.Arbitrary<JournalLine[]> = fc
  .uniqueArray(smallAssetArb, { minLength: 1, maxLength: 3 })
  .chain((assets) =>
    fc.tuple(
      ...assets.map((asset) =>
        fc
          .array(
            fc.tuple(
              fc.constantFrom('1100', '3900', '4100', '6100'),
              fc.bigInt({ min: -(10n ** 15n), max: 10n ** 15n }).filter((u) => u !== 0n),
            ),
            {
              minLength: 1,
              maxLength: 4,
            },
          )
          .map((parts): JournalLine[] => {
            const lines: JournalLine[] = parts.map(([account, units]) => ({
              account,
              amount: { asset, units },
            }));
            const sum = parts.reduce((acc, [, u]) => acc + u, 0n);
            if (sum !== 0n) lines.push({ account: '2990', amount: { asset, units: -sum } });
            return lines.length >= 2
              ? lines
              : [
                  ...lines,
                  { account: '1100', amount: { asset, units: 1n } },
                  { account: '2990', amount: { asset, units: -1n } },
                ];
          }),
      ),
    ),
  )
  .map((groups) => groups.flat());

let entrySeq = 0;
/** Arbitrary valid manual-style journal entry using accounts from the freelancer template. */
export const balancedEntryArb: fc.Arbitrary<JournalEntry> = balancedLinesArb.map((lines) => {
  entrySeq += 1;
  return {
    postingKey: `manual/test-${entrySeq}@1`,
    sourceKey: `manual/test-${entrySeq}`,
    date: '2026-11-16T00:00:00Z',
    description: 'generated',
    lines,
  };
});
