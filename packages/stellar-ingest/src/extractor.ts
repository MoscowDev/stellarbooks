/**
 * Core event extraction pipeline from closed ledgers.
 *
 * @module
 */
import type { EconomicEvent } from '@stellarbooks/core';
import { classifyTransaction } from './classifiers/classifier.js';
import type { LedgerCloseMetaRecord, TrackedSet } from './types.js';

/**
 * Extracts normalized EconomicEvent[] from a closed ledger record for a set of tracked wallets.
 *
 * @param ledger - Closed ledger metadata record.
 * @param tracked - Set or predicate of tracked wallet addresses.
 * @returns Array of normalized economic events.
 */
export function extractEvents(ledger: LedgerCloseMetaRecord, tracked: TrackedSet): EconomicEvent[] {
  const events: EconomicEvent[] = [];
  const ctx = {
    network: ledger.network,
    ledger: ledger.sequence,
    closeTime: ledger.ledgerCloseTime,
    tracked,
  };

  for (const tx of ledger.transactions) {
    const txEvents = classifyTransaction(tx, ctx);
    events.push(...txEvents);
  }

  return events;
}
