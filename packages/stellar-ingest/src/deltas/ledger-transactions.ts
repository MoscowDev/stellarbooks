import { TransactionBuilder, xdr } from '@stellar/stellar-sdk';

/** An envelope and its ledger metadata at one transaction apply position. */
export interface LedgerTransaction {
  /** Zero-based apply position in the ledger. */
  readonly index: number;
  /** Network-specific transaction hash in lowercase hexadecimal. */
  readonly hash: string;
  /** Envelope as included in the ledger transaction set. */
  readonly envelope: xdr.TransactionEnvelope;
  /** Result, fee changes and application metadata. */
  readonly processing: xdr.TransactionResultMeta | xdr.TransactionResultMetaV1;
}

/** Match ledger transaction envelopes to their results by hash and return them in apply order. */
export function matchLedgerTransactions(
  metadata: string | xdr.LedgerCloseMeta,
  networkPassphrase: string,
): LedgerTransaction[] {
  const decoded =
    typeof metadata === 'string' ? xdr.LedgerCloseMeta.fromXdr(metadata, 'base64') : metadata;
  const envelopes =
    decoded.type === 'v0'
      ? decoded.value.txSet.txs
      : decoded.value.txSet.value.phases.flatMap((phase) =>
          phase.type === 'v0Components'
            ? phase.value.flatMap((component) => component.value.txs)
            : phase.value.executionStages.flat(2),
        );
  const byHash = new Map<string, xdr.TransactionEnvelope>();
  for (const envelope of envelopes) {
    const transaction = TransactionBuilder.fromXdr(envelope, networkPassphrase);
    const hash = Buffer.from(transaction.hash()).toString('hex');
    if (byHash.has(hash)) throw new Error(`Duplicate transaction envelope ${hash}`);
    byHash.set(hash, envelope);
  }

  const transactions = decoded.value.txProcessing.map((processing, index) => {
    const hash = processing.result.transactionHash.toXdr('hex');
    const envelope = byHash.get(hash);
    if (envelope === undefined) throw new Error(`No transaction envelope matches result ${hash}`);
    byHash.delete(hash);
    return { index, hash, envelope, processing };
  });
  if (byHash.size !== 0) throw new Error('Ledger contains transaction envelopes without results');
  return transactions;
}
