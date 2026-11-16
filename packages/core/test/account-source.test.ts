import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  compareSourcePositions,
  createChart,
  findAccount,
  freelancerTemplate,
  merchantTemplate,
  normalBalance,
  payrollTemplate,
  StellarBooksValidationError,
  validateChart,
  validateSourcePosition,
  type Account,
  type SourcePosition,
  type SystemAccounts,
} from '../src/index.js';
import { sourceArb } from './arbitraries.js';

const SYSTEM: SystemAccounts = {
  wallets: 'W',
  escrow: 'E',
  conversion: 'CONV',
  suspense: 'S',
  networkFees: 'FEES',
  internalTransfers: 'IT',
  retainedEarnings: 'RE',
};
const ACCOUNTS: Account[] = [
  { code: 'W', name: 'Wallets', type: 'asset' },
  { code: 'E', name: 'Escrow', type: 'asset' },
  { code: 'IT', name: 'Internal', type: 'asset' },
  { code: 'CONV', name: 'Conversion', type: 'equity' },
  { code: 'RE', name: 'Retained', type: 'equity' },
  { code: 'S', name: 'Suspense', type: 'liability' },
  { code: 'FEES', name: 'Fees', type: 'expense' },
];

function codes(accounts: Account[], system: SystemAccounts = SYSTEM): string[] {
  return validateChart(accounts, system).map((i) => i.code);
}

describe('chart of accounts', () => {
  it('accepts a minimal valid chart and freezes it', () => {
    const chart = createChart(ACCOUNTS, SYSTEM);
    expect(findAccount(chart, 'W')?.name).toBe('Wallets');
    expect(findAccount(chart, 'nope')).toBeUndefined();
    expect(Object.isFrozen(chart.accounts)).toBe(true);
  });

  it('rejects duplicate and malformed codes and empty names', () => {
    expect(codes([...ACCOUNTS, { code: 'W', name: 'Again', type: 'asset' }])).toContain(
      'ACCOUNT_CODE_DUPLICATE',
    );
    expect(codes([...ACCOUNTS, { code: 'has space', name: 'x', type: 'asset' }])).toContain(
      'ACCOUNT_CODE_INVALID',
    );
    expect(codes([...ACCOUNTS, { code: 'X', name: '  ', type: 'asset' }])).toContain(
      'ACCOUNT_NAME_EMPTY',
    );
  });

  it('rejects missing parents, type mismatches and cycles', () => {
    expect(
      codes([...ACCOUNTS, { code: 'X', name: 'x', type: 'asset', parent: 'missing' }]),
    ).toContain('ACCOUNT_PARENT_MISSING');
    expect(codes([...ACCOUNTS, { code: 'X', name: 'x', type: 'income', parent: 'W' }])).toContain(
      'ACCOUNT_PARENT_TYPE',
    );
    expect(
      codes([
        ...ACCOUNTS,
        { code: 'A', name: 'a', type: 'asset', parent: 'B' },
        { code: 'B', name: 'b', type: 'asset', parent: 'A' },
      ]),
    ).toContain('ACCOUNT_PARENT_CYCLE');
  });

  it('requires system accounts to exist with the right types', () => {
    expect(codes(ACCOUNTS, { ...SYSTEM, suspense: 'missing' })).toContain('SYSTEM_ACCOUNT_MISSING');
    expect(codes(ACCOUNTS, { ...SYSTEM, networkFees: 'W' })).toContain('SYSTEM_ACCOUNT_TYPE');
    expect(() => createChart(ACCOUNTS, { ...SYSTEM, conversion: 'W' })).toThrow(
      StellarBooksValidationError,
    );
  });

  it('builds all templates without errors', () => {
    for (const t of [freelancerTemplate(), merchantTemplate(), payrollTemplate()]) {
      expect(validateChart(t.chart.accounts, t.chart.system)).toEqual([]);
    }
  });

  it('knows the normal balance side of each type', () => {
    expect(normalBalance('asset')).toBe('debit');
    expect(normalBalance('expense')).toBe('debit');
    expect(normalBalance('liability')).toBe('credit');
    expect(normalBalance('equity')).toBe('credit');
    expect(normalBalance('income')).toBe('credit');
  });
});

describe('source positions', () => {
  const base: SourcePosition = {
    network: 'testnet',
    ledger: 10,
    txIndex: 0,
    txHash: 'a'.repeat(64),
    stage: 'operation',
    opIndex: 0,
    eventIndex: 0,
  };

  it('accepts generated positions', () => {
    fc.assert(fc.property(sourceArb, (s) => validateSourcePosition(s).length === 0));
  });

  it.each([
    ['network', { network: 'Test Net' }, 'SOURCE_NETWORK_INVALID'],
    ['ledger 0', { ledger: 0 }, 'SOURCE_LEDGER_INVALID'],
    ['ledger > uint32', { ledger: 4294967296 }, 'SOURCE_LEDGER_INVALID'],
    ['uppercase hash', { txHash: 'A'.repeat(64) }, 'SOURCE_TX_HASH_INVALID'],
    ['missing opIndex', { opIndex: null }, 'SOURCE_OP_INDEX_INVALID'],
    ['opIndex on fee', { stage: 'fee', opIndex: 1 }, 'SOURCE_OP_INDEX_INVALID'],
    ['negative eventIndex', { eventIndex: -1 }, 'SOURCE_EVENT_INDEX_INVALID'],
  ] as [string, Partial<SourcePosition>, string][])('rejects invalid %s', (_n, patch, code) => {
    expect(validateSourcePosition({ ...base, ...patch }).map((i) => i.code)).toContain(code);
  });

  it('orders fee before operations before post-apply, and post-apply after later transactions', () => {
    const fee = { ...base, txIndex: 1, stage: 'fee' as const, opIndex: null };
    const op = { ...base, txIndex: 1 };
    const laterTx = { ...base, txIndex: 5 };
    const post = { ...base, txIndex: 1, stage: 'post_apply' as const, opIndex: null };
    const nextLedger = { ...base, ledger: 11, stage: 'fee' as const, opIndex: null };
    const sorted = [nextLedger, post, laterTx, op, fee].sort(compareSourcePositions);
    expect(sorted).toEqual([fee, op, laterTx, post, nextLedger]);
  });

  it('is a consistent total order (property)', () => {
    fc.assert(
      fc.property(sourceArb, sourceArb, sourceArb, (a, b, c) => {
        expect(Math.sign(compareSourcePositions(a, b))).toBe(
          -Math.sign(compareSourcePositions(b, a)),
        );
        expect(compareSourcePositions(a, a)).toBe(0);
        if (compareSourcePositions(a, b) <= 0 && compareSourcePositions(b, c) <= 0) {
          expect(compareSourcePositions(a, c)).toBeLessThanOrEqual(0);
        }
      }),
    );
  });
});
