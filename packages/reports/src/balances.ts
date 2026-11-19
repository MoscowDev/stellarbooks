import {
  computeBalances,
  type BalanceOptions,
  type BalanceRow,
  type JournalEntry,
} from '@stellarbooks/core';

/** Closing debit or credit balance of an account in one asset and optional wallet. */
export interface TrialBalanceRow extends Omit<BalanceRow, 'units'> {
  /** Net debit, in minor units. */
  readonly debit: bigint;
  /** Net credit, in minor units. */
  readonly credit: bigint;
}

/** Returns signed account balances with the requested date, ledger and wallet filters. */
export function balanceSnapshot(
  entries: Iterable<JournalEntry>,
  options?: BalanceOptions,
): BalanceRow[] {
  return computeBalances(entries, options);
}

/** Returns closing debit and credit columns, keeping each asset in its own units. */
export function trialBalance(
  entries: Iterable<JournalEntry>,
  options?: BalanceOptions,
): TrialBalanceRow[] {
  return balanceSnapshot(entries, options).map(({ units, ...position }) => ({
    ...position,
    debit: units > 0n ? units : 0n,
    credit: units < 0n ? -units : 0n,
  }));
}
