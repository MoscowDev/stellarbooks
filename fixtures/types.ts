/**
 * Types and definitions for StellarBooks golden fixtures.
 *
 * Golden fixtures capture raw or normalized ledger records alongside the exact
 * EconomicEvent[] and JournalEntry[] that StellarBooks is expected to derive.
 *
 * @module
 */
import type { EconomicEvent, JournalEntry, Memo } from '../packages/core/dist/index.js';

export interface FixtureOperationRecord {
  readonly index: number;
  readonly type: string;
  readonly sourceAccount?: string;
  readonly detail?: Record<string, unknown>;
}

export interface FixtureBalanceDelta {
  readonly wallet: string;
  readonly asset: string; // serialized AssetId
  readonly deltaUnits: string; // signed bigint as string
  readonly reason?: string;
}

export interface FixtureContractEvent {
  readonly contractId: string;
  readonly type: 'transfer' | 'mint' | 'burn' | 'clawback';
  readonly from?: string;
  readonly to?: string;
  readonly amountUnits: string; // bigint as string
  readonly asset?: string;
}

export interface FixtureTransactionRecord {
  readonly txHash: string;
  readonly txIndex: number;
  readonly feeBump: boolean;
  readonly feePayer: string;
  readonly feeCharged: string; // bigint as string
  readonly successful: boolean;
  readonly memo?: Memo;
  readonly operations: readonly FixtureOperationRecord[];
  readonly deltas: readonly FixtureBalanceDelta[];
  readonly contractEvents?: readonly FixtureContractEvent[];
}

export interface FixtureLedgerRecord {
  readonly network: string;
  readonly sequence: number;
  readonly ledgerCloseTime: string;
  readonly rawMetaXdr?: string;
  readonly transactions: readonly FixtureTransactionRecord[];
}

export interface GoldenFixture {
  readonly id: string;
  readonly description: string;
  readonly operationType: string;
  readonly trackedWallets: readonly string[];
  readonly ledgerRecord: FixtureLedgerRecord;
  readonly expectedEvents: readonly EconomicEvent[];
  readonly expectedJournal: readonly JournalEntry[];
}
