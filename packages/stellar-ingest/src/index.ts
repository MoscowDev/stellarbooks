/**
 * Reads Stellar ledger data (LedgerCloseMeta XDR) and normalizes it into economic events for StellarBooks.
 *
 * @packageDocumentation
 */
export {
  isTracked,
  type BalanceDeltaRecord,
  type ContractEventRecord,
  type LedgerCloseMetaRecord,
  type LedgerSource,
  type OperationRecord,
  type TrackedSet,
  type TransactionRecord,
} from './types.js';

export { FixtureLedgerSource } from './sources/fixture-source.js';
export { RpcLedgerSource, type RpcLedgerSourceOptions } from './sources/rpc-source.js';
export { extractEvents } from './extractor.js';
export { extractLedgerCloseMetaRecord, normalizeAsset } from './deltas/meta-deltas.js';
export { inspectLedgerHeader, type LedgerHeaderSummary } from './deltas/ledger-header.js';
export { matchLedgerTransactions, type LedgerTransaction } from './deltas/ledger-transactions.js';
export { decodeNativePayment } from './deltas/native-payment.js';
export { decodeLedger } from './deltas/ledger-decoder.js';
export { classifyTransaction } from './classifiers/classifier.js';
