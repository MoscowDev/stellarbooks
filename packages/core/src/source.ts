/**
 * Positions of economic facts on the Stellar ledger. A {@link SourcePosition} identifies exactly
 * where a fact came from, and gives a total, deterministic order for replay.
 *
 * @module
 */
import type { ValidationIssue } from './errors.js';

/**
 * The phase of transaction application a fact belongs to:
 * - `fee`: fee charged before operations are applied.
 * - `operation`: an effect of a specific operation.
 * - `post_apply`: after all transactions in the ledger. For example, Soroban fee refunds from
 *   Protocol 23 onwards (docs/research/stellar-transactions-fees-results.md).
 */
export type SourceStage = 'fee' | 'operation' | 'post_apply';

const STAGE_ORDER: Readonly<Record<SourceStage, number>> = { fee: 0, operation: 1, post_apply: 2 };

/** Where an economic fact came from on the ledger. */
export interface SourcePosition {
  /** Network slug, `[a-z0-9-]{1,32}`, for example `testnet` or `pubnet`. */
  readonly network: string;
  /** Ledger sequence number (uint32, at least 1). */
  readonly ledger: number;
  /** Zero-based application order of the transaction within the ledger. */
  readonly txIndex: number;
  /** Transaction hash as 64 lowercase hex characters. For a fee-bump this is the outer hash (Q-022). */
  readonly txHash: string;
  /** Phase of application. */
  readonly stage: SourceStage;
  /** Zero-based operation index when `stage` is `operation`; otherwise `null`. */
  readonly opIndex: number | null;
  /** Zero-based index of the fact within its (transaction, stage, operation) scope, assigned deterministically by the extractor. */
  readonly eventIndex: number;
}

const NETWORK_RE = /^[a-z0-9-]{1,32}$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const UINT32_MAX = 4294967295;

function isIndex(n: number): boolean {
  return Number.isSafeInteger(n) && n >= 0;
}

/**
 * Validates a source position.
 *
 * @param position - Position to check.
 * @param path - Path prefix used in issue locations.
 * @returns Every issue found (empty if valid).
 */
export function validateSourcePosition(
  position: SourcePosition,
  path = 'source',
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!NETWORK_RE.test(position.network)) {
    issues.push({
      code: 'SOURCE_NETWORK_INVALID',
      message: `network "${position.network}" must match [a-z0-9-]{1,32}`,
      path: `${path}.network`,
    });
  }
  if (
    !Number.isSafeInteger(position.ledger) ||
    position.ledger < 1 ||
    position.ledger > UINT32_MAX
  ) {
    issues.push({
      code: 'SOURCE_LEDGER_INVALID',
      message: `ledger ${position.ledger} must be a uint32 >= 1`,
      path: `${path}.ledger`,
    });
  }
  if (!isIndex(position.txIndex)) {
    issues.push({
      code: 'SOURCE_TX_INDEX_INVALID',
      message: 'txIndex must be a non-negative integer',
      path: `${path}.txIndex`,
    });
  }
  if (!HASH_RE.test(position.txHash)) {
    issues.push({
      code: 'SOURCE_TX_HASH_INVALID',
      message: 'txHash must be 64 lowercase hex characters',
      path: `${path}.txHash`,
    });
  }
  if (position.stage === 'operation') {
    if (position.opIndex === null || !isIndex(position.opIndex)) {
      issues.push({
        code: 'SOURCE_OP_INDEX_INVALID',
        message: 'opIndex must be a non-negative integer for operation stage',
        path: `${path}.opIndex`,
      });
    }
  } else if (position.opIndex !== null) {
    issues.push({
      code: 'SOURCE_OP_INDEX_INVALID',
      message: `opIndex must be null for ${position.stage} stage`,
      path: `${path}.opIndex`,
    });
  }
  if (!isIndex(position.eventIndex)) {
    issues.push({
      code: 'SOURCE_EVENT_INDEX_INVALID',
      message: 'eventIndex must be a non-negative integer',
      path: `${path}.eventIndex`,
    });
  }
  return issues;
}

/**
 * Total order over source positions: network, then ledger, transaction index, stage,
 * operation index and event index. Post-apply facts sort after all transactions in their ledger.
 *
 * @param a - First position.
 * @param b - Second position.
 * @returns Negative, zero or positive, like `Array.prototype.sort` comparators.
 */
export function compareSourcePositions(a: SourcePosition, b: SourcePosition): number {
  if (a.network !== b.network) return a.network < b.network ? -1 : 1;
  if (a.ledger !== b.ledger) return a.ledger - b.ledger;
  const aPost = a.stage === 'post_apply' ? 1 : 0;
  const bPost = b.stage === 'post_apply' ? 1 : 0;
  if (aPost !== bPost) return aPost - bPost;
  if (a.txIndex !== b.txIndex) return a.txIndex - b.txIndex;
  if (a.stage !== b.stage) return STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage];
  if (a.opIndex !== b.opIndex) return (a.opIndex ?? -1) - (b.opIndex ?? -1);
  if (a.eventIndex !== b.eventIndex) return a.eventIndex - b.eventIndex;
  return a.txHash === b.txHash ? 0 : a.txHash < b.txHash ? -1 : 1;
}
