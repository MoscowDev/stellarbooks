/**
 * Extraction of balance changes and ledger metadata from Stellar XDR.
 *
 * @module
 */
import { readMemo, readText, readUnits } from './normalized-fields.js';
import { assetId, NATIVE_ASSET, parseAssetId, type AssetId } from '@stellarbooks/core';
import type {
  BalanceDeltaRecord,
  LedgerCloseMetaRecord,
  OperationRecord,
  TransactionRecord,
} from '../types.js';

/**
 * Normalizes an asset identifier string or object into a canonical AssetId.
 */
export function normalizeAsset(raw: unknown): AssetId {
  if (typeof raw === 'string') {
    if (raw === 'native' || raw === 'XLM') return NATIVE_ASSET;
    return assetId(parseAssetId(raw));
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (obj['type'] === 'native' || obj['isNative'] === true) return NATIVE_ASSET;
    if (typeof obj['code'] === 'string' && typeof obj['issuer'] === 'string') {
      return assetId({
        kind: 'classic',
        code: obj['code'],
        issuer: obj['issuer'],
      });
    }
  }
  throw new TypeError('Unrecognized asset in normalized ledger data');
}

/**
 * Converts a pre-normalized ledger object into a LedgerCloseMetaRecord.
 * Throws for raw RPC responses until transaction metadata decoding is implemented.
 *
 * @param network - Network slug (e.g. "testnet").
 * @param sdkLedger - Ledger object with normalized transactions.
 */
export function extractLedgerCloseMetaRecord(
  network: string,
  sdkLedger: unknown,
): LedgerCloseMetaRecord {
  const ledgerObj = (sdkLedger ?? {}) as Record<string, unknown>;
  if (!Array.isArray(ledgerObj['transactions'])) {
    throw new Error('Ledger transaction metadata must be decoded before journal ingestion');
  }
  const sequence = Number(ledgerObj['sequence'] ?? 0);
  const ledgerCloseTime = readText(
    ledgerObj['ledgerCloseTime'] ?? ledgerObj['closedAt'] ?? ledgerObj['close_time'] ?? undefined,
  );

  const rawTxs = Array.isArray(ledgerObj['transactions'])
    ? (ledgerObj['transactions'] as Record<string, unknown>[])
    : [];

  const transactions: TransactionRecord[] = rawTxs.map((tx, idx): TransactionRecord => {
    const txHash = readText(tx['txHash'] ?? tx['hash'] ?? tx['id'] ?? '').toLowerCase();
    const feePayer = readText(tx['feePayer'] ?? tx['sourceAccount'] ?? tx['source_account'] ?? '');
    const feeCharged = readUnits(tx['feeCharged'] ?? tx['fee_charged']);
    const successful = tx['successful'] !== false && tx['status'] !== 'FAILED';
    const feeBump = Boolean(tx['feeBump'] ?? false);

    const ops: OperationRecord[] = Array.isArray(tx['operations'])
      ? (tx['operations'] as Record<string, unknown>[]).map((op, opIdx): OperationRecord => {
          const res: OperationRecord = {
            index: Number(op['index'] ?? opIdx),
            type: readText(op['type'] ?? 'payment'),
            ...(op['detail'] ? { detail: op['detail'] as Record<string, unknown> } : {}),
            ...(op['sourceAccount'] ? { sourceAccount: readText(op['sourceAccount']) } : {}),
          };
          return res;
        })
      : [];

    const deltas: BalanceDeltaRecord[] = Array.isArray(tx['deltas'])
      ? (tx['deltas'] as Record<string, unknown>[]).map((d): BalanceDeltaRecord => {
          const res: BalanceDeltaRecord = {
            wallet: readText(d['wallet']),
            asset: normalizeAsset(d['asset']),
            deltaUnits: readUnits(d['deltaUnits'] ?? d['delta'] ?? '0'),
            ...(d['reason'] ? { reason: readText(d['reason']) } : {}),
          };
          return res;
        })
      : [];

    const record: TransactionRecord = {
      txHash,
      txIndex: idx,
      feeBump,
      feePayer,
      feeCharged,
      successful,
      operations: ops,
      deltas,
      ...(tx['memo'] ? { memo: readMemo(tx['memo']) } : {}),
    };
    return record;
  });

  const record: LedgerCloseMetaRecord = {
    network,
    sequence,
    ledgerCloseTime,
    transactions,
    ...(typeof ledgerObj['metadataXdr'] === 'string'
      ? { rawMetaXdr: ledgerObj['metadataXdr'] }
      : {}),
  };
  return record;
}
