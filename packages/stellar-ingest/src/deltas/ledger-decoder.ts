/**
 * Decodes every transaction in a ledger's close metadata into normalized records.
 *
 * Balance deltas are computed from ledger-entry changes (ADR-0008): for each account or
 * trustline, the value in `CREATED`/`UPDATED` minus the preceding `STATE`, and minus the
 * preceding `STATE` for `REMOVED` (docs/research/stellar-transactions-fees-results.md §4.2).
 *
 * @module
 */
import {
  Asset,
  encodeMuxedAccountToAddress,
  extractBaseAddress,
  StrKey,
  xdr,
} from '@stellar/stellar-sdk';
import { assetId, NATIVE_ASSET, type AssetId, type Memo } from '@stellarbooks/core';
import type {
  BalanceDeltaRecord,
  LedgerCloseMetaRecord,
  OperationRecord,
  TransactionRecord,
} from '../types.js';
import { inspectLedgerHeader } from './ledger-header.js';
import { matchLedgerTransactions } from './ledger-transactions.js';

type Change = xdr.LedgerEntryChange;

function accountAddress(key: xdr.PublicKey): string {
  return StrKey.encodeEd25519PublicKey(key.value.value);
}

function muxedAddress(account: xdr.MuxedAccount): { base: string; full: string } {
  const full = encodeMuxedAccountToAddress(account);
  return { base: full.startsWith('M') ? extractBaseAddress(full) : full, full };
}

function sdkAsset(asset: xdr.Asset): AssetId {
  const decoded = Asset.fromOperation(asset);
  if (decoded.isNative()) return NATIVE_ASSET;
  const issuer = decoded.getIssuer();
  if (issuer === undefined) throw new Error('Issued asset has no issuer');
  return assetId({ kind: 'classic', code: decoded.getCode(), issuer });
}

function trustLineAsset(asset: xdr.TrustLineAsset): AssetId {
  switch (asset.type) {
    case 'assetTypeNative':
      return NATIVE_ASSET;
    case 'assetTypeCreditAlphanum4':
      return sdkAsset(xdr.Asset.assetTypeCreditAlphanum4(asset.alphaNum4));
    case 'assetTypeCreditAlphanum12':
      return sdkAsset(xdr.Asset.assetTypeCreditAlphanum12(asset.alphaNum12));
    case 'assetTypePoolShare':
      return assetId({ kind: 'pool', poolId: asset.liquidityPoolId.toXdr('hex') });
  }
}

/** Wallet, asset and balance of a balance-bearing entry, or undefined for other entry types. */
function holding(
  data: xdr.LedgerEntryData,
): { wallet: string; asset: AssetId; balance: bigint } | undefined {
  if (data.type === 'account') {
    return {
      wallet: accountAddress(data.value.accountId),
      asset: NATIVE_ASSET,
      balance: data.value.balance,
    };
  }
  if (data.type === 'trustline') {
    return {
      wallet: accountAddress(data.value.accountId),
      asset: trustLineAsset(data.value.asset),
      balance: data.value.balance,
    };
  }
  return undefined;
}

function removedHolding(key: xdr.LedgerKey): { wallet: string; asset: AssetId } | undefined {
  if (key.type === 'account') {
    return { wallet: accountAddress(key.value.accountId), asset: NATIVE_ASSET };
  }
  if (key.type === 'trustline') {
    return {
      wallet: accountAddress(key.value.accountId),
      asset: trustLineAsset(key.value.asset),
    };
  }
  return undefined;
}

/**
 * Net balance change per wallet and asset in one list of ledger-entry changes. Throws when an
 * update or removal has no preceding state, because the change could not be measured.
 */
function changeDeltas(changes: readonly Change[]): Map<string, BalanceDeltaRecord> {
  const before = new Map<string, bigint>();
  const out = new Map<string, BalanceDeltaRecord>();
  const add = (wallet: string, asset: AssetId, units: bigint): void => {
    const key = `${wallet}:${asset}`;
    out.set(key, { wallet, asset, deltaUnits: (out.get(key)?.deltaUnits ?? 0n) + units });
  };
  for (const change of changes) {
    if (change.type === 'ledgerEntryRemoved') {
      const removed = removedHolding(change.value);
      if (removed === undefined) continue;
      const key = `${removed.wallet}:${removed.asset}`;
      const opening = before.get(key);
      if (opening === undefined) throw new Error(`Removed entry ${key} has no prior state`);
      before.delete(key);
      add(removed.wallet, removed.asset, -opening);
      continue;
    }
    const entry = holding(change.value.data);
    if (entry === undefined) continue;
    const key = `${entry.wallet}:${entry.asset}`;
    if (change.type === 'ledgerEntryState' || change.type === 'ledgerEntryRestored') {
      before.set(key, entry.balance);
    } else if (change.type === 'ledgerEntryCreated') {
      add(entry.wallet, entry.asset, entry.balance);
    } else {
      const opening = before.get(key);
      if (opening === undefined) throw new Error(`Updated entry ${key} has no prior state`);
      before.set(key, entry.balance);
      add(entry.wallet, entry.asset, entry.balance - opening);
    }
  }
  return out;
}

function decodeMemo(memo: xdr.Memo): Memo | undefined {
  switch (memo.type) {
    case 'memoNone':
      return undefined;
    case 'memoText': {
      // Text memos are bytes. Invalid UTF-8 is kept in the reversible SEP-51 escape form (Q-041).
      let value: string;
      try {
        value = memo.text.toStringStrict();
      } catch {
        value = memo.text.toJson();
      }
      return { type: 'text', value };
    }
    case 'memoId':
      return { type: 'id', value: memo.id.toString() };
    case 'memoHash':
      return { type: 'hash', value: memo.hash.toXdr('hex') };
    case 'memoReturn':
      return { type: 'return', value: memo.retHash.toXdr('hex') };
  }
}

function snakeCase(name: string): string {
  return name.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
}

/** Operation details the classifier reads, using base `G` addresses plus any muxed form. */
function operationDetail(
  body: xdr.OperationBody,
  changes: readonly Change[],
): Record<string, unknown> | undefined {
  const withMuxed = (field: string, account: xdr.MuxedAccount): Record<string, string> => {
    const { base, full } = muxedAddress(account);
    return full === base ? { [field]: base } : { [field]: base, [`${field}Muxed`]: full };
  };
  switch (body.type) {
    case 'payment':
      return {
        ...withMuxed('destination', body.value.destination),
        asset: sdkAsset(body.value.asset),
        amount: body.value.amount,
      };
    case 'pathPaymentStrictSend':
    case 'pathPaymentStrictReceive':
      return {
        ...withMuxed('destination', body.value.destination),
        sendAsset: sdkAsset(body.value.sendAsset),
        destAsset: sdkAsset(body.value.destAsset),
      };
    case 'createAccount':
      return {
        destination: accountAddress(body.value.destination),
        startingBalance: body.value.startingBalance,
      };
    case 'accountMerge':
      return withMuxed('destination', body.value);
    case 'clawback':
      return {
        ...withMuxed('from', body.value.from),
        asset: sdkAsset(body.value.asset),
        amount: body.value.amount,
      };
    case 'createClaimableBalance': {
      const created = changes.find(
        (c) => c.type === 'ledgerEntryCreated' && c.value.data.type === 'claimableBalance',
      );
      if (
        created?.type !== 'ledgerEntryCreated' ||
        created.value.data.type !== 'claimableBalance'
      ) {
        throw new Error('Claimable balance creation has no created entry in its metadata');
      }
      return {
        balanceId: created.value.data.value.balanceId.toXdr('hex'),
        asset: sdkAsset(body.value.asset),
        amount: body.value.amount,
      };
    }
    case 'claimClaimableBalance':
      return { balanceId: body.value.balanceId.toXdr('hex') };
    default:
      return undefined;
  }
}

function transactionMetaParts(meta: xdr.TransactionMeta): {
  before: readonly Change[];
  operations: readonly (readonly Change[])[];
  after: readonly Change[];
} {
  switch (meta.type) {
    case 'operations':
      return { before: [], operations: meta.value.map((op) => op.changes), after: [] };
    case 'v1':
      return {
        before: meta.value.txChanges,
        operations: meta.value.operations.map((op) => op.changes),
        after: [],
      };
    case 'v2':
    case 'v3':
    case 'v4':
      return {
        before: meta.value.txChangesBefore,
        operations: meta.value.operations.map((op) => op.changes),
        after: meta.value.txChangesAfter,
      };
  }
}

/**
 * Decodes all transactions in Base64 `LedgerCloseMeta` into normalized records with complete
 * non-fee balance deltas (`deltasComplete: true`).
 *
 * - `feePayer` is the fee-bump fee source when present, otherwise the transaction source.
 * - `feeCharged` is `TransactionResult.feeCharged`. The decoder checks that the fee payer's XLM
 *   changes in fee processing, `postTxApplyFeeProcessing` and transaction-level changes net to
 *   exactly `-feeCharged`, and throws otherwise.
 * - Operation deltas carry `opIndex`. Failed transactions keep their operations for reference,
 *   but carry no operation deltas because failed operations change no balances.
 * - Soroban contract events are not decoded yet; token movements appear as balance deltas only.
 *
 * @param metadata - `LedgerCloseMeta` as Base64 XDR or as decoded by the SDK, for example from RPC
 *   `getLedgers`.
 * @param network - Network slug recorded on the result, for example `testnet`.
 * @param networkPassphrase - Passphrase used to hash envelopes and match them to results.
 */
export function decodeLedger(
  metadata: string | xdr.LedgerCloseMeta,
  network: string,
  networkPassphrase: string,
): LedgerCloseMetaRecord {
  const decoded =
    typeof metadata === 'string' ? xdr.LedgerCloseMeta.fromXdr(metadata, 'base64') : metadata;
  const header = inspectLedgerHeader(decoded);
  const transactions = matchLedgerTransactions(decoded, networkPassphrase).map(
    ({ index, hash, envelope, processing }): TransactionRecord => {
      let tx: xdr.Transaction;
      let feePayer: string;
      let feeBump = false;
      if (envelope.type === 'envelopeTypeTxFeeBump') {
        feeBump = true;
        feePayer = muxedAddress(envelope.value.tx.feeSource).base;
        tx = envelope.value.tx.innerTx.value.tx;
      } else if (envelope.type === 'envelopeTypeTx') {
        tx = envelope.value.tx;
        feePayer = muxedAddress(tx.sourceAccount).base;
      } else {
        throw new Error(`Transaction ${hash} uses unsupported envelope type ${envelope.type}`);
      }
      const txSource = muxedAddress(tx.sourceAccount).base;
      const { feeCharged, result } = processing.result.result;
      const successful = result.type === 'txSuccess' || result.type === 'txFeeBumpInnerSuccess';
      const parts = transactionMetaParts(processing.txApplyProcessing);

      // Fee-processing and transaction-level changes: the fee payer's XLM change is the fee.
      const feeLists = [
        processing.feeProcessing,
        'postTxApplyFeeProcessing' in processing ? processing.postTxApplyFeeProcessing : [],
      ];
      let feeDelta = 0n;
      for (const list of feeLists) {
        for (const d of changeDeltas(list).values()) {
          if (d.wallet !== feePayer || d.asset !== NATIVE_ASSET) {
            throw new Error(`Transaction ${hash} fee processing changes ${d.wallet} ${d.asset}`);
          }
          feeDelta += d.deltaUnits;
        }
      }
      const deltas: BalanceDeltaRecord[] = [];
      for (const list of [parts.before, parts.after]) {
        for (const d of changeDeltas(list).values()) {
          if (d.deltaUnits === 0n) continue;
          // Before Protocol 23 the Soroban refund arrives in txChangesAfter (research §2.2).
          if (d.wallet === feePayer && d.asset === NATIVE_ASSET) feeDelta += d.deltaUnits;
          else deltas.push(d);
        }
      }
      if (feeDelta !== -feeCharged) {
        throw new Error(
          `Transaction ${hash} fee changes total ${feeDelta.toString()}, expected -${feeCharged.toString()}`,
        );
      }

      const operations: OperationRecord[] = tx.operations.map((op, opIndex) => {
        const changes = successful ? (parts.operations[opIndex] ?? []) : [];
        const detail = successful ? operationDetail(op.body, changes) : undefined;
        const source = op.sourceAccount ? muxedAddress(op.sourceAccount) : undefined;
        return {
          index: opIndex,
          type: snakeCase(op.body.type),
          sourceAccount: source?.base ?? txSource,
          ...(detail
            ? {
                detail:
                  source && source.full !== source.base
                    ? { ...detail, sourceMuxed: source.full }
                    : detail,
              }
            : {}),
        };
      });
      if (successful) {
        if (parts.operations.length !== tx.operations.length) {
          throw new Error(`Transaction ${hash} metadata does not cover every operation`);
        }
        parts.operations.forEach((changes, opIndex) => {
          for (const d of changeDeltas(changes).values()) {
            if (d.deltaUnits !== 0n) deltas.push({ ...d, opIndex });
          }
        });
      }

      const memo = decodeMemo(tx.memo);
      return {
        txHash: hash,
        txIndex: index,
        feeBump,
        feePayer,
        feeCharged,
        successful,
        ...(memo ? { memo } : {}),
        operations,
        deltas,
        deltasComplete: true,
      };
    },
  );
  return {
    network,
    sequence: header.sequence,
    ledgerCloseTime: header.closeTime,
    rawMetaXdr: typeof metadata === 'string' ? metadata : decoded.toXdr('base64'),
    transactions,
  };
}
