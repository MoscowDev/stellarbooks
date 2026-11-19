import { amount, NATIVE_ASSET, type JournalEntry } from '@stellarbooks/core';
import { describe, expect, it } from 'vitest';
import {
  accountStatement,
  balanceSnapshot,
  generalLedger,
  toCsv,
  toJson,
  trialBalance,
} from '../src/index.js';

function entry(key: string, units: bigint): JournalEntry {
  return {
    postingKey: key,
    sourceKey: key,
    date: '2026-11-18T00:00:00Z',
    description: key,
    lines: [
      { account: '1000', amount: amount(NATIVE_ASSET, units) },
      { account: '4000', amount: amount(NATIVE_ASSET, -units) },
    ],
  };
}

describe('journal reports', () => {
  const entries = [entry('b', -2n), entry('a', 5n)];

  it('orders same-date postings deterministically and carries forward the balance', () => {
    const rows = generalLedger(entries, '1000').rows;
    expect(
      rows.map(({ postingKey, debit, credit, balance }) => [postingKey, debit, credit, balance]),
    ).toEqual([
      ['a', 5n, 0n, 5n],
      ['b', 0n, 2n, 3n],
    ]);
  });

  it('returns signed snapshots and net debit and credit columns', () => {
    expect(balanceSnapshot(entries).map(({ units }) => units)).toEqual([3n, -3n]);
    expect(trialBalance(entries).map(({ debit, credit }) => [debit, credit])).toEqual([
      [3n, 0n],
      [0n, 3n],
    ]);
  });

  it('carries earlier balances forward and includes both statement boundaries', () => {
    const statement = accountStatement(
      [
        { ...entry('opening', 8n), date: '2026-11-17T00:00:00Z' },
        ...entries,
        { ...entry('after', 1n), date: '2026-11-19T00:00:00Z' },
      ],
      '1000',
      '2026-11-18T00:00:00Z',
      '2026-11-18T00:00:00Z',
    );
    expect(statement.rows.map(({ balance }) => balance)).toEqual([13n, 11n]);
    expect(statement.balances).toEqual([{ asset: NATIVE_ASSET, opening: 8n, closing: 11n }]);
  });

  it('exports exact bigint values and quotes CSV delimiters', () => {
    const rows = [{ units: 9007199254740993n, note: 'a,"b"\nc' }];
    expect(toCsv(rows, ['note', 'units'])).toBe('note,units\r\n"a,""b""\nc",9007199254740993\r\n');
    expect(toJson(rows)).toBe('[{"units":"9007199254740993","note":"a,\\"b\\"\\nc"}]');
  });
});
