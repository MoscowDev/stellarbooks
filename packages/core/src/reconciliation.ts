import type { AssetId } from './asset.js';
import { computeBalances } from './balances.js';
import { isUtcTimestamp } from './events.js';
import type { JournalEntry } from './journal.js';

/** Independently observed wallet balance, in the asset's minor units. */
export interface ObservedBalance {
  /** Wallet identifier. */
  readonly wallet: string;
  /** Asset identifier. */
  readonly asset: AssetId;
  /** Observed units, including explicit zeroes. */
  readonly units: bigint;
}

/** Independently supplied snapshot for one network and ledger. */
export interface LedgerBalanceSnapshot {
  /** Network identifier matching the journal's source positions. */
  readonly network: string;
  /** Sequence at which all included balances were observed. */
  readonly ledger: number;
  /** Ledger close timestamp in UTC. */
  readonly closeTime: string;
  /** Snapshot provenance, such as an archive identifier. */
  readonly source: string;
  /** Observations keyed by wallet and asset. */
  readonly balances: readonly ObservedBalance[];
}

/** One wallet and asset comparison. */
export interface ReconciliationRow {
  /** Wallet identifier. */
  readonly wallet: string;
  /** Asset identifier. */
  readonly asset: AssetId;
  /** Balance calculated from the journal. */
  readonly computed: bigint;
  /** Observed balance, or null when it is missing from the snapshot. */
  readonly observed: bigint | null;
  /** Computed minus observed, or null when no observation exists. */
  readonly difference: bigint | null;
}

/** Exact comparison of a single book to a supplied snapshot. */
export interface ReconciliationReport {
  /** Snapshot used for this comparison. */
  readonly snapshot: LedgerBalanceSnapshot;
  /** Whether every reported position has an observation and agrees exactly. */
  readonly matched: boolean;
  /** Comparisons sorted by wallet and asset. */
  readonly rows: readonly ReconciliationRow[];
}

/**
 * Compares a book's wallet control account with independently observed balances.
 * Supply complete journal history and observations for the book's wallet positions,
 * including opening postings and explicit zero balances where needed.
 */
export function reconcileBalances(
  entries: Iterable<JournalEntry>,
  walletAccount: string,
  snapshot: LedgerBalanceSnapshot,
): ReconciliationReport {
  if (
    !Number.isSafeInteger(snapshot.ledger) ||
    snapshot.ledger < 1 ||
    !isUtcTimestamp(snapshot.closeTime) ||
    snapshot.source.trim() === '' ||
    snapshot.network.trim() === '' ||
    snapshot.balances.length === 0
  ) {
    throw new RangeError('Expected a ledger snapshot with provenance and observations');
  }

  const positions = new Map<string, ReconciliationRow>();
  for (const { wallet, asset, units } of snapshot.balances) {
    const key = JSON.stringify([wallet, asset]);
    if (positions.has(key)) throw new Error('Duplicate wallet and asset observation');
    positions.set(key, { wallet, asset, computed: 0n, observed: units, difference: -units });
  }

  const journal = [...entries];
  if (journal.some(({ source }) => source !== undefined && source.network !== snapshot.network)) {
    throw new Error('Journal and snapshot networks differ');
  }
  for (const { account, wallet, asset, units } of computeBalances(journal, {
    asOfLedger: snapshot.ledger,
    asOfDate: snapshot.closeTime,
    byWallet: true,
    includeZero: true,
  })) {
    if (account !== walletAccount) continue;
    if (wallet === undefined) throw new Error('Wallet control account posting has no wallet');
    const key = JSON.stringify([wallet, asset]);
    const observed = positions.get(key)?.observed ?? null;
    positions.set(key, {
      wallet,
      asset,
      computed: units,
      observed,
      difference: observed === null ? null : units - observed,
    });
  }

  const rows = [...positions.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, row]) => row);
  return { snapshot, rows, matched: rows.every(({ difference }) => difference === 0n) };
}
