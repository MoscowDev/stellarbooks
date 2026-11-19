import { xdr } from '@stellar/stellar-sdk';

/** Header and transaction positions derived from ledger close metadata. */
export interface LedgerHeaderSummary {
  /** Ledger sequence number. */
  readonly sequence: number;
  /** Ledger close time as ISO 8601 UTC. */
  readonly closeTime: string;
  /** Protocol version recorded in the header. */
  readonly protocolVersion: number;
  /** Lowercase hexadecimal ledger header hash. */
  readonly hash: string;
  /** Lowercase hexadecimal transaction result hashes in apply order. */
  readonly transactionHashes: readonly string[];
}

/** Read the header and transaction apply order from Base64 or SDK-decoded ledger close metadata. */
export function inspectLedgerHeader(metadata: string | xdr.LedgerCloseMeta): LedgerHeaderSummary {
  const decoded =
    typeof metadata === 'string' ? xdr.LedgerCloseMeta.fromXdr(metadata, 'base64') : metadata;
  const { ledgerHeader, txProcessing } = decoded.value;
  const { header, hash } = ledgerHeader;
  return {
    sequence: header.ledgerSeq,
    closeTime: new Date(Number(header.scpValue.closeTime) * 1000).toISOString(),
    protocolVersion: header.ledgerVersion,
    hash: hash.toXdr('hex'),
    transactionHashes: txProcessing.map(({ result }) => result.transactionHash.toXdr('hex')),
  };
}
