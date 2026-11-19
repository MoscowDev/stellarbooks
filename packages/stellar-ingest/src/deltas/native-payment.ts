import { StrKey, type xdr } from '@stellar/stellar-sdk';
import { NATIVE_ASSET } from '@stellarbooks/core';
import type { LedgerCloseMetaRecord } from '../types.js';
import { inspectLedgerHeader } from './ledger-header.js';
import { matchLedgerTransactions } from './ledger-transactions.js';

function accountChanges(changes: readonly xdr.LedgerEntryChange[]): Map<string, bigint> {
  const before = new Map<string, bigint>();
  const deltas = new Map<string, bigint>();
  for (const change of changes) {
    if (change.type !== 'ledgerEntryState' && change.type !== 'ledgerEntryUpdated') {
      throw new Error('Expected account state and update changes');
    }
    const { data } = change.value;
    if (data.type !== 'account') throw new Error('Expected account-only changes');
    const wallet = StrKey.encodeEd25519PublicKey(data.value.accountId.value.value);
    if (change.type === 'ledgerEntryState') {
      if (before.has(wallet) || deltas.has(wallet)) throw new Error('Duplicate account state');
      before.set(wallet, data.value.balance);
    } else {
      const opening = before.get(wallet);
      if (opening === undefined) throw new Error('Account update is missing prior state');
      before.delete(wallet);
      deltas.set(wallet, data.value.balance - opening);
    }
  }
  if (before.size !== 0) throw new Error('Account state is missing its update');
  return deltas;
}

/**
 * Decodes one successful, single-operation native payment from V4 transaction metadata.
 * The result contains only the selected transaction and must not be used as a complete ledger.
 * Supports unmuxed accounts and transactions without a memo or post-application fee changes.
 */
export function decodeNativePayment(
  metadata: string,
  network: string,
  networkPassphrase: string,
  index: number,
): LedgerCloseMetaRecord {
  const transaction = matchLedgerTransactions(metadata, networkPassphrase)[index];
  if (transaction?.envelope.type !== 'envelopeTypeTx')
    throw new Error('Expected a standard transaction');
  const tx = transaction.envelope.value.tx;
  const [operation] = tx.operations;
  const result = transaction.processing.result.result;
  const meta = transaction.processing.txApplyProcessing;
  if (
    tx.operations.length !== 1 ||
    operation?.body.type !== 'payment' ||
    result.result.type !== 'txSuccess' ||
    meta.type !== 'v4' ||
    tx.memo.type !== 'memoNone' ||
    ('postTxApplyFeeProcessing' in transaction.processing &&
      transaction.processing.postTxApplyFeeProcessing.length !== 0)
  ) {
    throw new Error('Expected a successful single native payment with V4 metadata');
  }

  const payment = operation.body.value;
  const sender = operation.sourceAccount ?? tx.sourceAccount;
  if (
    sender.type !== 'keyTypeEd25519' ||
    tx.sourceAccount.type !== 'keyTypeEd25519' ||
    payment.destination.type !== 'keyTypeEd25519' ||
    payment.asset.type !== 'assetTypeNative'
  ) {
    throw new Error('Expected an unmuxed XLM payment');
  }
  const from = StrKey.encodeEd25519PublicKey(sender.value.value);
  const to = StrKey.encodeEd25519PublicKey(payment.destination.value.value);
  const feePayer = StrKey.encodeEd25519PublicKey(tx.sourceAccount.value.value);
  const [operationMeta] = meta.value.operations;
  if (operationMeta === undefined || meta.value.operations.length !== 1) {
    throw new Error('Payment application metadata is missing');
  }
  const deltas = accountChanges(operationMeta.changes);
  const fees = accountChanges(transaction.processing.feeProcessing);
  if (
    from === to ||
    payment.amount <= 0n ||
    result.feeCharged <= 0n ||
    deltas.size !== 2 ||
    deltas.get(from) !== -payment.amount ||
    deltas.get(to) !== payment.amount ||
    fees.size !== 1 ||
    fees.get(feePayer) !== -result.feeCharged
  ) {
    throw new Error('Payment or fee does not agree with account balance changes');
  }

  const header = inspectLedgerHeader(metadata);
  return {
    network,
    sequence: header.sequence,
    ledgerCloseTime: header.closeTime,
    rawMetaXdr: metadata,
    transactions: [
      {
        txHash: transaction.hash,
        txIndex: transaction.index,
        feeBump: false,
        feePayer,
        feeCharged: result.feeCharged,
        successful: true,
        operations: [
          {
            index: 0,
            type: 'payment',
            sourceAccount: from,
            detail: { destination: to, asset: NATIVE_ASSET, amount: payment.amount },
          },
        ],
        deltas: [...deltas].map(([wallet, deltaUnits]) => ({
          wallet,
          asset: NATIVE_ASSET,
          deltaUnits,
        })),
      },
    ],
  };
}
