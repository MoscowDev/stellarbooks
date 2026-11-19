import type { AssetId, JournalEntry } from '@stellarbooks/core';
import { generalLedger, type GeneralLedgerReport } from './general-ledger.js';

/** Opening and closing balances for one asset in an account statement. */
export interface StatementBalance {
  /** Asset identifier. */
  readonly asset: AssetId;
  /** Balance immediately before the start of the statement. */
  readonly opening: bigint;
  /** Balance after all postings through the statement end. */
  readonly closing: bigint;
}

/** Activity and asset balances over an inclusive interval. */
export interface AccountStatement extends GeneralLedgerReport {
  /** Per-asset opening and closing balances in minor units. */
  readonly balances: readonly StatementBalance[];
}

/** Builds a statement from a single book's history through the inclusive end timestamp. */
export function accountStatement(
  entries: readonly JournalEntry[],
  accountCode: string,
  fromDate: string,
  toDate: string,
): AccountStatement {
  const from = Date.parse(fromDate);
  const to = Date.parse(toDate);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) {
    throw new RangeError('Expected an ordered statement date range');
  }

  const balances = new Map<AssetId, StatementBalance>();
  const rows = generalLedger(entries, accountCode).rows.filter((row) => {
    const date = Date.parse(row.date);
    if (date > to) return false;
    const opening = date < from ? row.balance : (balances.get(row.asset)?.opening ?? 0n);
    balances.set(row.asset, { asset: row.asset, opening, closing: row.balance });
    return date >= from;
  });
  return {
    accountCode,
    rows,
    balances: [...balances.values()].sort((a, b) =>
      a.asset < b.asset ? -1 : a.asset > b.asset ? 1 : 0,
    ),
  };
}
