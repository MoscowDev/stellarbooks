import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  assertValidEntry,
  canonicalEntryJson,
  chainSourceKey,
  computeBalances,
  freelancerTemplate,
  manualSourceKey,
  NATIVE_ASSET,
  postingKey,
  reversalKey,
  reverseEntry,
  StellarBooksValidationError,
  validateEntry,
  type JournalEntry,
} from '../src/index.js';
import { ASSETS, balancedEntryArb, sourceArb, WALLETS } from './arbitraries.js';

const chart = freelancerTemplate().chart;
const USDC = ASSETS[1] ?? NATIVE_ASSET;

const valid: JournalEntry = {
  postingKey: 'manual/opening@1',
  sourceKey: 'manual/opening',
  date: '2026-11-16T12:00:00Z',
  description: 'Opening balance',
  lines: [
    { account: '1100', amount: { asset: NATIVE_ASSET, units: 100n }, wallet: WALLETS[0] },
    { account: '3800', amount: { asset: NATIVE_ASSET, units: -100n } },
    { account: '1100', amount: { asset: USDC, units: 7n }, wallet: WALLETS[0] },
    { account: '3800', amount: { asset: USDC, units: -7n } },
  ],
};

function issueCodes(entry: JournalEntry): string[] {
  return validateEntry(entry, chart).map((i) => i.code);
}

describe('validateEntry', () => {
  it('accepts a balanced multi-asset entry', () => {
    expect(validateEntry(valid, chart)).toEqual([]);
    expect(() => {
      assertValidEntry(valid, chart);
    }).not.toThrow();
  });

  it('rejects an entry that balances in total but not per asset', () => {
    const entry = {
      ...valid,
      lines: [
        { account: '1100', amount: { asset: NATIVE_ASSET, units: 100n } },
        { account: '3800', amount: { asset: USDC, units: -100n } },
      ],
    };
    expect(issueCodes(entry).filter((c) => c === 'ENTRY_UNBALANCED')).toHaveLength(2);
  });

  it.each([
    [
      'zero amount',
      {
        lines: [
          { account: '1100', amount: { asset: NATIVE_ASSET, units: 0n } },
          { account: '3800', amount: { asset: NATIVE_ASSET, units: 0n } },
        ],
      },
      'LINE_AMOUNT_ZERO',
    ],
    [
      'single line',
      { lines: [{ account: '1100', amount: { asset: NATIVE_ASSET, units: 1n } }] },
      'ENTRY_TOO_FEW_LINES',
    ],
    [
      'unknown account',
      {
        lines: [
          { account: '9999', amount: { asset: NATIVE_ASSET, units: 1n } },
          { account: '3800', amount: { asset: NATIVE_ASSET, units: -1n } },
        ],
      },
      'LINE_ACCOUNT_UNKNOWN',
    ],
    ['bad date', { date: '2026-11-16 12:00' }, 'ENTRY_DATE_INVALID'],
    ['impossible date', { date: '2026-13-45T00:00:00Z' }, 'ENTRY_DATE_INVALID'],
    ['empty description', { description: ' ' }, 'ENTRY_DESCRIPTION_EMPTY'],
    ['empty key', { postingKey: '' }, 'ENTRY_KEY_EMPTY'],
    [
      'bad wallet',
      {
        lines: [
          { account: '1100', amount: { asset: NATIVE_ASSET, units: 1n }, wallet: 'nope' },
          { account: '3800', amount: { asset: NATIVE_ASSET, units: -1n } },
        ],
      },
      'LINE_WALLET_INVALID',
    ],
    [
      'muxed counterparty',
      {
        lines: [
          {
            account: '1100',
            amount: { asset: NATIVE_ASSET, units: 1n },
            counterparty: 'M' + 'A'.repeat(68),
          },
          { account: '3800', amount: { asset: NATIVE_ASSET, units: -1n } },
        ],
      },
      'LINE_COUNTERPARTY_INVALID',
    ],
  ] as [string, Partial<JournalEntry>, string][])('rejects %s', (_name, patch, code) => {
    expect(issueCodes({ ...valid, ...patch })).toContain(code);
  });

  it('accepts millisecond close times (Protocol 30, CAP-88)', () => {
    expect(issueCodes({ ...valid, date: '2026-11-16T12:00:00.123Z' })).toEqual([]);
  });

  it('throws with every issue listed', () => {
    const bad = { ...valid, description: '', date: 'x' };
    expect(() => {
      assertValidEntry(bad, chart);
    }).toThrow(StellarBooksValidationError);
    try {
      assertValidEntry(bad, chart);
    } catch (e) {
      expect((e as StellarBooksValidationError).issues.map((i) => i.code)).toEqual([
        'ENTRY_DATE_INVALID',
        'ENTRY_DESCRIPTION_EMPTY',
      ]);
    }
  });

  it('generated balanced entries are valid, and changing one line unbalances them (property)', () => {
    fc.assert(
      fc.property(
        balancedEntryArb,
        fc.nat(),
        fc.bigInt({ min: 1n, max: 10n ** 12n }),
        (entry, pick, delta) => {
          expect(validateEntry(entry, chart)).toEqual([]);
          const i = pick % entry.lines.length;
          const lines = entry.lines.map((l, j) =>
            j === i ? { ...l, amount: { ...l.amount, units: l.amount.units + delta } } : l,
          );
          expect(validateEntry({ ...entry, lines }, chart).map((x) => x.code)).toContain(
            'ENTRY_UNBALANCED',
          );
        },
      ),
    );
  });
});

describe('canonicalEntryJson', () => {
  it('is independent of property insertion order and omits undefined', () => {
    const reordered: JournalEntry = {
      lines: valid.lines,
      description: valid.description,
      date: valid.date,
      sourceKey: valid.sourceKey,
      postingKey: valid.postingKey,
    };
    expect(canonicalEntryJson(reordered)).toBe(canonicalEntryJson(valid));
    expect(canonicalEntryJson(valid)).toContain('"units":"100"');
    expect(canonicalEntryJson({ ...valid, ...({ ruleId: undefined } as object) })).toBe(
      canonicalEntryJson(valid),
    );
  });

  it('changes when any amount changes', () => {
    const changed = {
      ...valid,
      lines: valid.lines.map((l, i) =>
        i === 0 ? { ...l, amount: { ...l.amount, units: 101n } } : l,
      ),
    };
    expect(canonicalEntryJson(changed)).not.toBe(canonicalEntryJson(valid));
  });
});

describe('posting keys', () => {
  const source = {
    network: 'testnet',
    ledger: 123,
    txIndex: 2,
    txHash: 'f'.repeat(64),
    stage: 'operation' as const,
    opIndex: 1,
    eventIndex: 0,
  };

  it('formats chain, posting, reversal and manual keys', () => {
    const sk = chainSourceKey(source, 'transfer-in');
    expect(sk).toBe(`chain/testnet/123/${'f'.repeat(64)}/operation/1/0/transfer-in`);
    expect(postingKey(sk, '1')).toBe(`${sk}@1`);
    expect(reversalKey(`${sk}@1`)).toBe(`reversal/${sk}@1`);
    expect(manualSourceKey('opening-2026')).toBe('manual/opening-2026');
    expect(chainSourceKey({ ...source, stage: 'fee', opIndex: null }, 'fee')).toContain(
      '/fee/-/0/fee',
    );
  });

  it('excludes the rule-set version from the source key (ADR-0010)', () => {
    const sk = chainSourceKey(source, 'r');
    expect(postingKey(sk, '1')).not.toBe(postingKey(sk, '2'));
    expect(sk).not.toContain('@');
  });

  it('rejects invalid components', () => {
    expect(() => chainSourceKey(source, 'has space')).toThrow(StellarBooksValidationError);
    expect(() => chainSourceKey({ ...source, ledger: 0 }, 'r')).toThrow(
      StellarBooksValidationError,
    );
    expect(() => postingKey('x', 'v/1')).toThrow(StellarBooksValidationError);
    expect(() => manualSourceKey('')).toThrow(StellarBooksValidationError);
    expect(() => reversalKey('')).toThrow(StellarBooksValidationError);
  });

  it('distinct positions give distinct keys (property)', () => {
    fc.assert(
      fc.property(sourceArb, sourceArb, (a, b) => {
        const same =
          JSON.stringify(a) === JSON.stringify(b) ||
          (a.ledger === b.ledger &&
            a.txHash === b.txHash &&
            a.stage === b.stage &&
            a.opIndex === b.opIndex &&
            a.eventIndex === b.eventIndex);
        expect(chainSourceKey(a, 'r') === chainSourceKey(b, 'r')).toBe(same);
      }),
    );
  });
});

describe('reverseEntry', () => {
  it('creates a valid entry that references the original', () => {
    const rev = reverseEntry(valid, { date: '2026-11-17T00:00:00Z', reason: 'duplicate import' });
    expect(rev.reverses).toBe(valid.postingKey);
    expect(rev.postingKey).toBe(`reversal/${valid.postingKey}`);
    expect(rev.meta).toEqual({ reason: 'duplicate import' });
    expect(validateEntry(rev, chart)).toEqual([]);
  });

  it('refuses to reverse a reversal, and needs a date and reason', () => {
    const rev = reverseEntry(valid, { date: '2026-11-17T00:00:00Z', reason: 'x' });
    expect(() => reverseEntry(rev, { date: '2026-11-18T00:00:00Z', reason: 'y' })).toThrow(
      /REVERSAL_OF_REVERSAL/,
    );
    expect(() => reverseEntry(valid, { date: 'tomorrow', reason: 'x' })).toThrow(
      /REVERSAL_DATE_INVALID/,
    );
    expect(() => reverseEntry(valid, { date: '2026-11-17T00:00:00Z', reason: '' })).toThrow(
      /REVERSAL_REASON_EMPTY/,
    );
  });

  it('an entry and its reversal net to zero for every account, asset and wallet (property)', () => {
    fc.assert(
      fc.property(balancedEntryArb, (entry) => {
        const rev = reverseEntry(entry, { date: '2026-11-17T00:00:00Z', reason: 'test' });
        expect(validateEntry(rev, chart)).toEqual([]);
        expect(computeBalances([entry, rev], { byWallet: true })).toEqual([]);
      }),
    );
  });
});
