/**
 * Types and interfaces for StellarBooks ingestion.
 *
 * @module
 */
import type { AssetId, Memo } from '@stellarbooks/core';

/**
 * Normalized operation detail within a transaction.
 */
export interface OperationRecord {
  /** Zero-based operation index in transaction. */
  readonly index: number;
  /** Operation type name, e.g. "payment", "path_payment_strict_send", etc. */
  readonly type: string;
  /** Operation source account, if explicitly set; otherwise defaults to transaction source. */
  readonly sourceAccount?: string;
  /** Decoded operation details. */
  readonly detail?: Record<string, unknown>;
}

/**
 * Observable net balance change for a wallet and asset extracted from transaction metadata.
 */
export interface BalanceDeltaRecord {
  /** Account address (`G...` or contract `C...`). */
  readonly wallet: string;
  /** Canonical asset identifier. */
  readonly asset: AssetId;
  /** Signed change in integer minor units. */
  readonly deltaUnits: bigint;
  /** Optional origin or explanation. */
  readonly reason?: string;
}

/**
 * Decoded Soroban smart contract event (SAC or SEP-41).
 */
export interface ContractEventRecord {
  /** Contract address (`C...`). */
  readonly contractId: string;
  /** Event classification. */
  readonly type: 'transfer' | 'mint' | 'burn' | 'clawback';
  /** Sender or source address, if applicable. */
  readonly from?: string;
  /** Recipient or destination address, if applicable. */
  readonly to?: string;
  /** Quantity in minor units. */
  readonly amountUnits: bigint;
  /** Canonical asset identifier, if known. */
  readonly asset?: AssetId;
}

/**
 * Normalized record of a single transaction within a ledger.
 */
export interface TransactionRecord {
  /** 64-character lowercase hex transaction hash (outer hash for fee-bumps). */
  readonly txHash: string;
  /** Zero-based index of transaction within the ledger. */
  readonly txIndex: number;
  /** Whether this transaction is a fee-bump transaction. */
  readonly feeBump: boolean;
  /** Account that paid the fee (outer account for fee-bumps). */
  readonly feePayer: string;
  /** Fee charged in stroops (bigint). */
  readonly feeCharged: bigint;
  /** Whether transaction application succeeded. */
  readonly successful: boolean;
  /** Memo, if present. */
  readonly memo?: Memo;
  /** Operations applied in this transaction. */
  readonly operations: readonly OperationRecord[];
  /** Net balance deltas for all accounts affected in this transaction. */
  readonly deltas: readonly BalanceDeltaRecord[];
  /** Soroban contract events emitted, if any. */
  readonly contractEvents?: readonly ContractEventRecord[];
}

/**
 * Normalized ledger metadata record representing a closed Stellar ledger.
 */
export interface LedgerCloseMetaRecord {
  /** Network identifier, e.g. "testnet" or "pubnet". */
  readonly network: string;
  /** Ledger sequence number. */
  readonly sequence: number;
  /** Ledger close time in ISO 8601 UTC format. */
  readonly ledgerCloseTime: string;
  /** Raw base64 LedgerCloseMeta XDR, if available. */
  readonly rawMetaXdr?: string;
  /** Transactions executed in this ledger. */
  readonly transactions: readonly TransactionRecord[];
}

/**
 * Ingestion source producing a sequence of closed ledgers.
 */
export interface LedgerSource {
  /**
   * Streams or iterates ledger records across a range.
   *
   * @param startLedger - First ledger sequence (inclusive).
   * @param endLedger - Optional last ledger sequence (inclusive).
   */
  ledgers(startLedger: number, endLedger?: number): AsyncIterable<LedgerCloseMetaRecord>;
}

/**
 * Set or predicate of tracked wallet addresses (`G...` or `C...`).
 */
export type TrackedSet = ReadonlySet<string> | ((address: string) => boolean);

/**
 * Returns true if an address is tracked.
 */
export function isTracked(tracked: TrackedSet, address: string): boolean {
  if (typeof tracked === 'function') {
    return tracked(address);
  }
  return tracked.has(address);
}
