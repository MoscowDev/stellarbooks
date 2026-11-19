/**
 * General Ledger report generation.
 *
 * @module
 */
import type { AssetId, JournalEntry } from '@stellarbooks/core';

/** One journal line and its running balance in the reporting account. */
export interface GeneralLedgerRow {
  /** UTC accounting timestamp. */
  readonly date: string;
  /** Key of the underlying journal entry. */
  readonly postingKey: string;
  /** Journal entry description. */
  readonly description: string;
  /** Reporting account code. */
  readonly accountCode: string;
  /** Asset in which the row is denominated. */
  readonly asset: AssetId;
  /** Positive debit amount or 0n. */
  readonly debit: bigint;
  /** Positive credit amount or 0n. */
  readonly credit: bigint;
  /** Running balance for this account and asset. */
  readonly balance: bigint;
}

/** Activity and running balances for one account. */
export interface GeneralLedgerReport {
  /** Reporting account code. */
  readonly accountCode: string;
  /** Rows in accounting date order, with posting keys breaking ties. */
  readonly rows: readonly GeneralLedgerRow[];
}

/**
 * Builds a General Ledger report for a specific account code over the given journal entries.
 *
 * @param entries - Journal entries.
 * @param accountCode - Account code to report on.
 */
export function generalLedger(
  entries: readonly JournalEntry[],
  accountCode: string,
): GeneralLedgerReport {
  const rows: GeneralLedgerRow[] = [];
  const runningBalances = new Map<string, bigint>();

  const sorted = [...entries].sort(
    (a, b) =>
      Date.parse(a.date) - Date.parse(b.date) ||
      (a.postingKey < b.postingKey ? -1 : a.postingKey > b.postingKey ? 1 : 0),
  );

  for (const entry of sorted) {
    for (const line of entry.lines) {
      if (line.account === accountCode) {
        const assetStr = line.amount.asset;
        const currentBal = (runningBalances.get(assetStr) ?? 0n) + line.amount.units;
        runningBalances.set(assetStr, currentBal);

        const debit = line.amount.units > 0n ? line.amount.units : 0n;
        const credit = line.amount.units < 0n ? -line.amount.units : 0n;

        rows.push({
          date: entry.date,
          postingKey: entry.postingKey,
          description: entry.description,
          accountCode,
          asset: assetStr,
          debit,
          credit,
          balance: currentBal,
        });
      }
    }
  }

  return {
    accountCode,
    rows,
  };
}
