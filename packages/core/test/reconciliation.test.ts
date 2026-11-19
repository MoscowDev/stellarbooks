import { describe, expect, it } from 'vitest';
import { amount, NATIVE_ASSET, reconcileBalances, type JournalEntry } from '../src/index.js';

const wallet = 'GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI';
const opening: JournalEntry = {
  postingKey: 'manual/opening',
  sourceKey: 'manual/opening',
  date: '2026-11-17T00:00:00Z',
  description: 'Opening balance',
  lines: [
    { account: '1000', wallet, amount: amount(NATIVE_ASSET, 100n) },
    { account: '3000', amount: amount(NATIVE_ASSET, -100n) },
  ],
};
const snapshot = {
  network: 'testnet',
  ledger: 200,
  closeTime: '2026-11-18T00:00:00Z',
  source: 'synthetic snapshot',
  balances: [{ wallet, asset: NATIVE_ASSET, units: 100n }],
};

describe('offline reconciliation', () => {
  it('matches exact balances and excludes later journal postings', () => {
    const later = { ...opening, date: '2026-11-19T00:00:00Z' };
    expect(reconcileBalances([opening, later], '1000', snapshot)).toMatchObject({
      matched: true,
      rows: [{ difference: 0n }],
    });
  });

  it('reports a one-stroop difference', () => {
    const mismatch = { ...snapshot, balances: [{ wallet, asset: NATIVE_ASSET, units: 99n }] };
    expect(reconcileBalances([opening], '1000', mismatch)).toMatchObject({
      matched: false,
      rows: [{ computed: 100n, observed: 99n, difference: 1n }],
    });
  });

  it('keeps missing observations distinct from zero', () => {
    const differentWallet = {
      ...snapshot,
      balances: [{ wallet: 'other', asset: NATIVE_ASSET, units: 0n }],
    };
    expect(reconcileBalances([opening], '1000', differentWallet)).toMatchObject({
      matched: false,
      rows: [{ computed: 100n, observed: null, difference: null }, { observed: 0n }],
    });
  });
});
