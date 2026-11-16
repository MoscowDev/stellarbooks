/**
 * Balance aggregation over journal entries.
 *
 * @module
 */
import type { AssetId } from './asset.js';
import type { JournalEntry } from './journal.js';

/** Signed balance of one account, in one asset, optionally for one wallet sub-ledger. */
export interface BalanceRow {
  /** Account code. */
  readonly account: string;
  /** Asset. */
  readonly asset: AssetId;
  /** Wallet sub-ledger, or `undefined` for lines without a wallet. */
  readonly wallet?: string;
  /** Signed total: positive means a net debit balance, negative a net credit balance. */
  readonly units: bigint;
}

/** Options for {@link computeBalances}. */
export interface BalanceOptions {
  /** Include only entries dated at or before this ISO 8601 UTC timestamp. */
  readonly asOfDate?: string;
  /** Include only chain entries at or before this ledger. Entries without a source are included. */
  readonly asOfLedger?: number;
  /** Split balances by wallet sub-ledger (default `false`). */
  readonly byWallet?: boolean;
  /** Keep rows whose total is zero (default `false`). */
  readonly includeZero?: boolean;
}

/**
 * Computes account balances from entries. The result is sorted by account, asset and then wallet,
 * so it is independent of entry order.
 *
 * @param entries - Journal entries, in any order.
 * @param options - Filters and grouping.
 */
export function computeBalances(
  entries: Iterable<JournalEntry>,
  options: BalanceOptions = {},
): BalanceRow[] {
  const asOfMs = options.asOfDate === undefined ? undefined : Date.parse(options.asOfDate);
  const totals = new Map<
    string,
    { account: string; asset: AssetId; wallet: string | undefined; units: bigint }
  >();
  for (const entry of entries) {
    if (asOfMs !== undefined && Date.parse(entry.date) > asOfMs) continue;
    if (
      options.asOfLedger !== undefined &&
      entry.source !== undefined &&
      entry.source.ledger > options.asOfLedger
    )
      continue;
    for (const line of entry.lines) {
      const wallet = options.byWallet === true ? line.wallet : undefined;
      const key = JSON.stringify([line.account, line.amount.asset, wallet ?? null]);
      const row = totals.get(key);
      if (row === undefined) {
        totals.set(key, {
          account: line.account,
          asset: line.amount.asset,
          wallet,
          units: line.amount.units,
        });
      } else {
        row.units += line.amount.units;
      }
    }
  }
  const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  return [...totals.values()]
    .filter((r) => options.includeZero === true || r.units !== 0n)
    .sort(
      (a, b) =>
        cmp(a.account, b.account) || cmp(a.asset, b.asset) || cmp(a.wallet ?? '', b.wallet ?? ''),
    )
    .map((r) =>
      r.wallet === undefined
        ? { account: r.account, asset: r.asset, units: r.units }
        : { ...r, wallet: r.wallet },
    );
}
