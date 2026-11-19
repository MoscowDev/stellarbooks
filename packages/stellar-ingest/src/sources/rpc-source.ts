/**
 * Stellar RPC-backed LedgerSource.
 *
 * Fetches ledger pages via Stellar RPC `getLedgers` per ADR-0003.
 *
 * @module
 */
import { rpc } from '@stellar/stellar-sdk';
import { inspectLedgerHeader } from '../deltas/ledger-header.js';
import { extractLedgerCloseMetaRecord } from '../deltas/meta-deltas.js';
import type { LedgerCloseMetaRecord, LedgerSource } from '../types.js';

export interface RpcLedgerSourceOptions {
  /** RPC endpoint URL, e.g. "https://soroban-testnet.stellar.org". */
  readonly rpcUrl: string;
  /** Network slug, e.g. "testnet". */
  readonly network: string;
  /** Max ledgers per page request (1-200, default 50). */
  readonly batchSize?: number;
  /** Request timeout in milliseconds. */
  readonly timeoutMs?: number;
}

export class RpcLedgerSource implements LedgerSource {
  private readonly server: rpc.Server;
  private readonly network: string;
  private readonly batchSize: number;

  constructor(opts: RpcLedgerSourceOptions) {
    this.server = new rpc.Server(opts.rpcUrl, {
      timeout: opts.timeoutMs ?? 30000,
    });
    this.network = opts.network;
    this.batchSize = Math.max(1, Math.min(opts.batchSize ?? 50, 200));
  }

  async *ledgers(startLedger: number, endLedger?: number): AsyncIterable<LedgerCloseMetaRecord> {
    let currentLedger = startLedger;
    let targetLedger = endLedger;

    while (targetLedger === undefined || currentLedger <= targetLedger) {
      const response = await this.server.getLedgers({
        startLedger: currentLedger,
        pagination: { limit: this.batchSize },
      });

      targetLedger ??= response.latestLedger;
      if (targetLedger > response.latestLedger) {
        throw new RangeError(`Requested end ledger ${String(targetLedger)} is beyond the RPC tip`);
      }
      if (response.ledgers.length === 0 && currentLedger <= targetLedger) {
        throw new Error(`Missing ledger ${String(currentLedger)} in RPC response`);
      }

      for (const ledgerItem of response.ledgers) {
        if (currentLedger > targetLedger) {
          return;
        }

        if (ledgerItem.sequence !== currentLedger) {
          throw new Error(
            `Expected ledger ${String(currentLedger)}, received ${String(ledgerItem.sequence)}`,
          );
        }
        const header = inspectLedgerHeader(ledgerItem.metadataXdr);
        if (
          header.sequence !== ledgerItem.sequence ||
          header.hash !== ledgerItem.hash ||
          Date.parse(header.closeTime) / 1000 !== Number(ledgerItem.ledgerCloseTime)
        ) {
          throw new Error(
            `Ledger ${String(currentLedger)} RPC fields disagree with close metadata`,
          );
        }
        const record = extractLedgerCloseMetaRecord(this.network, ledgerItem);
        yield record;
        currentLedger = ledgerItem.sequence + 1;
      }
    }
  }
}
