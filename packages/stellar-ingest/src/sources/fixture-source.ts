/**
 * Fixture-backed LedgerSource for deterministic replay and tests.
 *
 * @module
 */
import {
  readContractEventType,
  readMemo,
  readText,
  readUnits,
} from '../deltas/normalized-fields.js';
import { normalizeAsset } from '../deltas/meta-deltas.js';
import type { LedgerCloseMetaRecord, LedgerSource, TransactionRecord } from '../types.js';

export class FixtureLedgerSource implements LedgerSource {
  private readonly records: readonly LedgerCloseMetaRecord[];

  constructor(items: readonly unknown[]) {
    this.records = items.map((item): LedgerCloseMetaRecord => {
      const rec =
        item && typeof item === 'object' && 'ledgerRecord' in item
          ? (item as { ledgerRecord: Record<string, unknown> }).ledgerRecord
          : (item as Record<string, unknown>);

      const txs = Array.isArray(rec['transactions']) ? rec['transactions'] : [];
      const normalizedTxs: TransactionRecord[] = txs.map(
        (t: Record<string, unknown>, idx: number): TransactionRecord => {
          const ops = Array.isArray(t['operations']) ? t['operations'] : [];
          const deltas = Array.isArray(t['deltas']) ? t['deltas'] : [];
          const contractEvents = Array.isArray(t['contractEvents']) ? t['contractEvents'] : [];

          return {
            txHash: readText(t['txHash'] ?? ''),
            txIndex: Number(t['txIndex'] ?? idx),
            feeBump: Boolean(t['feeBump']),
            feePayer: readText(t['feePayer'] ?? ''),
            feeCharged: readUnits(t['feeCharged'] ?? '0'),
            successful: t['successful'] !== false,
            ...(t['memo'] ? { memo: readMemo(t['memo']) } : {}),
            operations: ops.map((op: Record<string, unknown>, opIdx: number) => ({
              index: Number(op['index'] ?? opIdx),
              type: readText(op['type']),
              ...(op['sourceAccount'] ? { sourceAccount: readText(op['sourceAccount']) } : {}),
              ...(op['detail'] ? { detail: op['detail'] as Record<string, unknown> } : {}),
            })),
            deltas: deltas.map((d: Record<string, unknown>) => ({
              wallet: readText(d['wallet']),
              asset: normalizeAsset(d['asset']),
              deltaUnits: readUnits(d['deltaUnits'] ?? '0'),
              ...(d['reason'] ? { reason: readText(d['reason']) } : {}),
            })),
            ...(contractEvents.length > 0
              ? {
                  contractEvents: contractEvents.map((e: Record<string, unknown>) => ({
                    contractId: readText(e['contractId']),
                    type: readContractEventType(e['type']),
                    amountUnits: readUnits(e['amountUnits'] ?? '0'),
                    ...(e['from'] ? { from: readText(e['from']) } : {}),
                    ...(e['to'] ? { to: readText(e['to']) } : {}),
                    ...(e['asset'] ? { asset: normalizeAsset(e['asset']) } : {}),
                  })),
                }
              : {}),
          };
        },
      );

      return {
        network: readText(rec['network'] ?? 'testnet'),
        sequence: Number(rec['sequence'] ?? 0),
        ledgerCloseTime: readText(rec['ledgerCloseTime'] ?? undefined),
        transactions: normalizedTxs,
      };
    });
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- Fixture data is in memory and implements the async source interface.
  async *ledgers(startLedger: number, endLedger?: number): AsyncIterable<LedgerCloseMetaRecord> {
    for (const rec of this.records) {
      if (rec.sequence >= startLedger && (endLedger === undefined || rec.sequence <= endLedger)) {
        yield rec;
      }
    }
  }
}
