import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  canonicalEntryJson,
  computeBalances,
  createRuleSet,
  defineRule,
  ECONOMIC_EVENT_KINDS,
  extendRuleSet,
  freelancerTemplate,
  mapEvents,
  merchantTemplate,
  NATIVE_ASSET,
  payrollTemplate,
  StellarBooksValidationError,
  validateEvent,
  type EconomicEvent,
  type EconomicEventBase,
  type MappingContext,
} from '../src/index.js';
import { ASSETS, eventArb, gAddress, WALLETS } from './arbitraries.js';

const TEMPLATES = [freelancerTemplate(), merchantTemplate(), payrollTemplate()];
const freelancer = TEMPLATES[0] ?? freelancerTemplate();
const ctx: MappingContext = { chart: freelancer.chart, trackedWallets: new Set(WALLETS) };
const [W1, W2] = WALLETS;
const USDC = ASSETS[1] ?? NATIVE_ASSET;
const EXTERNAL = gAddress('CLIENT');

function base(
  ledger: number,
  txIndex: number,
  opIndex: number | null,
  eventIndex = 0,
  wallet: string = W1,
): EconomicEventBase {
  return {
    source: {
      network: 'testnet',
      ledger,
      txIndex,
      txHash: ledger.toString(16).padStart(32, '0') + txIndex.toString(16).padStart(32, '0'),
      stage: opIndex === null ? 'fee' : 'operation',
      opIndex,
      eventIndex,
    },
    closeTime: '2026-11-16T10:00:00Z',
    wallet,
  };
}

describe('validateEvent', () => {
  it('accepts all generated events (property)', () => {
    fc.assert(fc.property(eventArb, (e) => validateEvent(e).length === 0));
  });

  it.each([
    [
      'non-native fee',
      { ...base(1, 0, null), kind: 'fee', amount: { asset: USDC, units: 1n } },
      'EVENT_FEE_NOT_NATIVE',
    ],
    [
      'zero transfer',
      {
        ...base(1, 0, 0),
        kind: 'transfer',
        direction: 'in',
        amount: { asset: USDC, units: 0n },
        via: 'payment',
      },
      'EVENT_AMOUNT_NOT_POSITIVE',
    ],
    [
      'muxed counterparty',
      {
        ...base(1, 0, 0),
        kind: 'transfer',
        direction: 'in',
        amount: { asset: USDC, units: 1n },
        via: 'payment',
        counterparty: 'M' + 'A'.repeat(68),
      },
      'EVENT_COUNTERPARTY_INVALID',
    ],
    [
      'bad muxed id',
      {
        ...base(1, 0, 0),
        muxedId: '18446744073709551616',
        kind: 'fee',
        amount: { asset: NATIVE_ASSET, units: 1n },
      },
      'EVENT_MUXED_ID_INVALID',
    ],
    [
      'bad id memo',
      {
        ...base(1, 0, 0),
        memo: { type: 'id', value: '-1' },
        kind: 'fee',
        amount: { asset: NATIVE_ASSET, units: 1n },
      },
      'EVENT_MEMO_INVALID',
    ],
    [
      'empty exchange',
      {
        ...base(1, 0, 0),
        kind: 'exchange',
        given: [],
        received: [{ asset: USDC, units: 1n }],
        via: 'offer',
      },
      'EVENT_EXCHANGE_EMPTY',
    ],
    [
      'duplicate exchange asset',
      {
        ...base(1, 0, 0),
        kind: 'exchange',
        given: [
          { asset: USDC, units: 1n },
          { asset: USDC, units: 2n },
        ],
        received: [{ asset: NATIVE_ASSET, units: 1n }],
        via: 'offer',
      },
      'EVENT_EXCHANGE_DUPLICATE_ASSET',
    ],
    [
      'zero unclassified',
      {
        ...base(1, 0, 0),
        kind: 'unclassified_change',
        delta: { asset: USDC, units: 0n },
        reason: 'x',
      },
      'EVENT_DELTA_ZERO',
    ],
    [
      'bad close time',
      {
        ...base(1, 0, 0),
        closeTime: '2026-11-16',
        kind: 'fee',
        amount: { asset: NATIVE_ASSET, units: 1n },
      },
      'EVENT_TIME_INVALID',
    ],
  ] as [string, EconomicEvent, string][])('rejects %s', (_n, event, code) => {
    expect(validateEvent(event).map((i) => i.code)).toContain(code);
  });

  it('accepts the maximum uint64 muxed id', () => {
    expect(
      validateEvent({
        ...base(1, 0, null),
        muxedId: '18446744073709551615',
        kind: 'fee',
        amount: { asset: NATIVE_ASSET, units: 1n },
      }),
    ).toEqual([]);
  });
});

describe('templates', () => {
  it('cover every economic event kind with no unmatched events or failures (property)', () => {
    for (const template of TEMPLATES) {
      const context: MappingContext = { chart: template.chart, trackedWallets: new Set(WALLETS) };
      fc.assert(
        fc.property(fc.array(eventArb, { maxLength: 20 }), (events) => {
          const result = mapEvents(events, template.ruleSet, context);
          expect(result.failures).toEqual([]);
          expect(result.unmatched).toEqual([]);
          expect(result.entries).toHaveLength(events.length);
        }),
      );
    }
    expect(ECONOMIC_EVENT_KINDS).toHaveLength(6);
  });

  it('book a payment received from a client as income, with memo metadata', () => {
    const event: EconomicEvent = {
      ...base(100, 0, 0),
      memo: { type: 'text', value: 'INV-7' },
      kind: 'transfer',
      direction: 'in',
      amount: { asset: USDC, units: 500_0000000n },
      counterparty: EXTERNAL,
      via: 'payment',
    };
    const { entries } = mapEvents([event], freelancer.ruleSet, ctx);
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry?.ruleId).toBe('transfer-in');
    expect(entry?.lines).toEqual([
      {
        account: '1100',
        amount: { asset: USDC, units: 500_0000000n },
        wallet: W1,
        counterparty: EXTERNAL,
      },
      { account: '4100', amount: { asset: USDC, units: -500_0000000n }, counterparty: EXTERNAL },
    ]);
    expect(entry?.meta).toMatchObject({
      memo: 'INV-7',
      memoType: 'text',
      via: 'payment',
      eventKind: 'transfer',
    });
    expect(entry?.postingKey).toBe(`${entry?.sourceKey ?? ''}@1`);
  });

  it('book transfers between tracked wallets through clearing, netting to zero', () => {
    const out: EconomicEvent = {
      ...base(5, 0, 0, 0, W1),
      kind: 'transfer',
      direction: 'out',
      amount: { asset: USDC, units: 10n },
      counterparty: W2,
      via: 'payment',
    };
    const inn: EconomicEvent = {
      ...base(5, 0, 0, 1, W2),
      kind: 'transfer',
      direction: 'in',
      amount: { asset: USDC, units: 10n },
      counterparty: W1,
      via: 'payment',
    };
    const { entries } = mapEvents([out, inn], freelancer.ruleSet, ctx);
    expect(entries.map((e) => e.ruleId)).toEqual(['transfer-internal', 'transfer-internal']);
    const balances = computeBalances(entries, { byWallet: true });
    expect(balances.find((b) => b.account === '1190')).toBeUndefined();
    expect(balances).toEqual(
      [
        { account: '1100', asset: USDC, wallet: W2, units: 10n },
        { account: '1100', asset: USDC, wallet: W1, units: -10n },
      ].sort((a, b) => (a.wallet < b.wallet ? -1 : 1)),
    );
  });

  it('book a path payment as an exchange plus an outgoing transfer, balanced per asset', () => {
    const exchange: EconomicEvent = {
      ...base(9, 0, 0, 0),
      kind: 'exchange',
      given: [{ asset: NATIVE_ASSET, units: 100_0000000n }],
      received: [{ asset: USDC, units: 10_0000000n }],
      via: 'path_payment',
    };
    const send: EconomicEvent = {
      ...base(9, 0, 0, 1),
      kind: 'transfer',
      direction: 'out',
      amount: { asset: USDC, units: 10_0000000n },
      counterparty: EXTERNAL,
      via: 'path_payment',
    };
    const fee: EconomicEvent = {
      ...base(9, 0, null),
      kind: 'fee',
      amount: { asset: NATIVE_ASSET, units: 100n },
    };
    const { entries } = mapEvents([send, exchange, fee], freelancer.ruleSet, ctx);
    expect(entries.map((e) => e.ruleId)).toEqual(['fee', 'exchange', 'transfer-out']);
    expect(computeBalances(entries)).toEqual([
      { account: '1100', asset: NATIVE_ASSET, units: -100_0000100n },
      // Rows sort by account, then asset id ("classic:..." sorts before "native").
      { account: '3900', asset: USDC, units: -10_0000000n },
      { account: '3900', asset: NATIVE_ASSET, units: 100_0000000n },
      { account: '6100', asset: USDC, units: 10_0000000n },
      { account: '6900', asset: NATIVE_ASSET, units: 100n },
    ]);
  });

  it('book clawbacks and burns as write-offs, not ordinary expenses', () => {
    const claw: EconomicEvent = {
      ...base(3, 0, 0),
      kind: 'transfer',
      direction: 'out',
      amount: { asset: USDC, units: 5n },
      counterparty: EXTERNAL,
      via: 'clawback',
    };
    expect(mapEvents([claw], freelancer.ruleSet, ctx).entries[0]?.ruleId).toBe(
      'transfer-write-off',
    );
  });

  it('book the claimable balance lifecycle through escrow', () => {
    const amt = { asset: USDC, units: 50n };
    const lock: EconomicEvent = {
      ...base(1, 0, 0),
      kind: 'escrow',
      action: 'lock',
      amount: amt,
      balanceId: '00'.repeat(36),
    };
    const release: EconomicEvent = {
      ...base(2, 0, 0),
      kind: 'escrow',
      action: 'release',
      amount: amt,
      balanceId: '00'.repeat(36),
      counterparty: EXTERNAL,
    };
    const balances = computeBalances(mapEvents([lock, release], freelancer.ruleSet, ctx).entries);
    expect(balances).toEqual([
      { account: '1100', asset: USDC, units: -50n },
      { account: '6100', asset: USDC, units: 50n },
    ]);
  });
});

describe('mapEvents', () => {
  it('is deterministic regardless of input order (property)', () => {
    fc.assert(
      fc.property(
        fc
          .uniqueArray(eventArb, {
            maxLength: 15,
            selector: (e) =>
              JSON.stringify(e.source, (_k, v: unknown) =>
                typeof v === 'bigint' ? v.toString() : v,
              ),
          })
          .chain((events) =>
            fc.tuple(
              fc.constant(events),
              fc.shuffledSubarray(events, { minLength: events.length, maxLength: events.length }),
            ),
          ),
        ([events, shuffled]) => {
          const a = mapEvents(events, freelancer.ruleSet, ctx).entries.map(canonicalEntryJson);
          const b = mapEvents(shuffled, freelancer.ruleSet, ctx).entries.map(canonicalEntryJson);
          expect(b).toEqual(a);
        },
      ),
    );
  });

  it('always produces entries that balance per asset (property)', () => {
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 20 }), (events) => {
        const { entries } = mapEvents(events, freelancer.ruleSet, ctx);
        const totals = new Map<string, bigint>();
        for (const e of entries)
          for (const l of e.lines)
            totals.set(l.amount.asset, (totals.get(l.amount.asset) ?? 0n) + l.amount.units);
        for (const t of totals.values()) expect(t).toBe(0n);
      }),
    );
  });

  it('returns unmatched events instead of dropping them', () => {
    const empty = createRuleSet({ id: 'empty', version: '1', rules: [] });
    const event: EconomicEvent = {
      ...base(1, 0, null),
      kind: 'fee',
      amount: { asset: NATIVE_ASSET, units: 1n },
    };
    expect(mapEvents([event], empty, ctx)).toEqual({
      entries: [],
      unmatched: [event],
      failures: [],
    });
  });

  it('reports invalid events, unbalanced rule output and throwing rules as failures', () => {
    const bad: EconomicEvent = {
      ...base(1, 0, null),
      kind: 'fee',
      amount: { asset: USDC, units: 1n },
    };
    const fee: EconomicEvent = {
      ...base(2, 0, null),
      kind: 'fee',
      amount: { asset: NATIVE_ASSET, units: 1n },
    };
    const unbalanced = createRuleSet({
      id: 'broken',
      version: '1',
      rules: [
        defineRule({
          id: 'half',
          description: 'only one side',
          matches: () => true,
          lines: (e) => [
            { account: '6900', amount: { asset: NATIVE_ASSET, units: 1n } },
            { account: '1100', amount: { asset: NATIVE_ASSET, units: -2n }, wallet: e.wallet },
          ],
        }),
      ],
    });
    const throwing = createRuleSet({
      id: 'throws',
      version: '1',
      rules: [
        defineRule({
          id: 'boom',
          description: 'throws',
          matches: () => true,
          lines: () => {
            throw new Error('boom');
          },
        }),
      ],
    });
    const r1 = mapEvents([bad, fee], unbalanced, ctx);
    expect(r1.entries).toEqual([]);
    expect(r1.failures.map((f) => [f.ruleId, f.issues.map((i) => i.code)])).toEqual([
      [undefined, ['EVENT_FEE_NOT_NATIVE']],
      ['half', ['ENTRY_UNBALANCED']],
    ]);
    const r2 = mapEvents([fee], throwing, ctx);
    expect(r2.failures[0]?.issues[0]).toEqual({ code: 'RULE_THREW', message: 'boom' });
  });

  it('lets custom rules take priority via extendRuleSet, with a new version in the posting key', () => {
    const consulting = defineRule({
      id: 'consulting-client',
      description: 'Payments from the consulting client',
      matches: (e) => e.kind === 'transfer' && e.direction === 'in' && e.counterparty === EXTERNAL,
      lines: (e) =>
        e.kind === 'transfer'
          ? [
              { account: '1100', amount: e.amount, wallet: e.wallet },
              {
                account: '4100',
                amount: { ...e.amount, units: -e.amount.units },
                note: 'consulting',
              },
            ]
          : [],
    });
    const custom = extendRuleSet(freelancer.ruleSet, {
      id: 'my-books',
      version: '2026.1',
      rules: [consulting],
    });
    const event: EconomicEvent = {
      ...base(1, 0, 0),
      kind: 'transfer',
      direction: 'in',
      amount: { asset: USDC, units: 1n },
      counterparty: EXTERNAL,
      via: 'payment',
    };
    const [entry] = mapEvents([event], custom, ctx).entries;
    expect(entry?.ruleId).toBe('consulting-client');
    expect(entry?.postingKey.endsWith('@2026.1')).toBe(true);
  });

  it('rejects invalid rules and rule sets', () => {
    const r = { id: 'ok', description: 'd', matches: () => false, lines: () => [] };
    expect(() => defineRule({ ...r, id: 'bad id' })).toThrow(StellarBooksValidationError);
    expect(() => defineRule({ ...r, description: '' })).toThrow(StellarBooksValidationError);
    expect(() => createRuleSet({ id: 'x', version: '1', rules: [r, r] })).toThrow(
      /RULE_ID_DUPLICATE/,
    );
    expect(() => createRuleSet({ id: 'x', version: 'v 1', rules: [] })).toThrow(
      /RULESET_VERSION_INVALID/,
    );
  });
});

describe('computeBalances', () => {
  const fee = (ledger: number): EconomicEvent => ({
    ...base(ledger, 0, null),
    kind: 'fee',
    amount: { asset: NATIVE_ASSET, units: 10n },
  });
  const { entries } = mapEvents([fee(1), fee(2), fee(3)], freelancer.ruleSet, ctx);

  it('filters by ledger and date', () => {
    expect(
      computeBalances(entries, { asOfLedger: 2 }).find((b) => b.account === '6900')?.units,
    ).toBe(20n);
    expect(computeBalances(entries, { asOfDate: '2026-11-15T00:00:00Z' })).toEqual([]);
  });

  it('can split by wallet and include zero rows', () => {
    expect(computeBalances(entries, { byWallet: true }).find((b) => b.account === '1100')).toEqual({
      account: '1100',
      asset: NATIVE_ASSET,
      wallet: W1,
      units: -30n,
    });
    expect(computeBalances([], { includeZero: true })).toEqual([]);
  });
});

describe('edge cases', () => {
  it('books a self-payment through internal clearing so it nets to zero', () => {
    const out: EconomicEvent = {
      ...base(7, 0, 0, 0),
      kind: 'transfer',
      direction: 'out',
      amount: { asset: USDC, units: 3n },
      counterparty: W1,
      via: 'payment',
    };
    const inn: EconomicEvent = {
      ...out,
      source: { ...out.source, eventIndex: 1 },
      direction: 'in',
    };
    const { entries } = mapEvents([out, inn], freelancer.ruleSet, ctx);
    expect(entries.map((e) => e.ruleId)).toEqual(['transfer-internal', 'transfer-internal']);
    expect(computeBalances(entries)).toEqual([]);
  });

  it('reports duplicate source positions instead of producing colliding keys', () => {
    const fee: EconomicEvent = {
      ...base(8, 0, null),
      kind: 'fee',
      amount: { asset: NATIVE_ASSET, units: 1n },
    };
    const result = mapEvents(
      [fee, { ...fee, amount: { asset: NATIVE_ASSET, units: 2n } }],
      freelancer.ruleSet,
      ctx,
    );
    expect(result.entries).toHaveLength(1);
    expect(result.failures.map((f) => f.issues.map((i) => i.code))).toEqual([
      ['ENTRY_KEY_DUPLICATE'],
    ]);
  });
});
