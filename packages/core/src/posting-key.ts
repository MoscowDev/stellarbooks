/**
 * Deterministic keys for journal entries (ADR-0006, refined by ADR-0010).
 *
 * - `sourceKey` identifies **what** an entry accounts for: a chain fact plus the rule that mapped
 *   it, but not the rule-set version. Storage allows at most one active (unreversed) entry per
 *   source key, so a rule-set upgrade cannot post the same fact twice.
 * - `postingKey` identifies **this exact entry**: the source key plus the rule-set version. It is
 *   the idempotency key, so replaying identical input is a no-op.
 *
 * Formats:
 * - chain: `chain/<network>/<ledger>/<txHash>/<stage>/<opIndex|->/<eventIndex>/<ruleId>`
 * - posting: `<sourceKey>@<ruleSetVersion>`
 * - reversal: `reversal/<postingKey of the reversed entry>`
 * - manual: `manual/<id>`
 *
 * @module
 */
import { StellarBooksValidationError } from './errors.js';
import { validateSourcePosition, type SourcePosition } from './source.js';

const TOKEN_RE = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Returns true if `value` may be used as a rule ID, rule-set version or manual entry ID:
 * 1-64 characters from `[A-Za-z0-9._-]`.
 *
 * @param value - Candidate token.
 */
export function isKeyToken(value: string): boolean {
  return TOKEN_RE.test(value);
}

function requireToken(what: string, value: string): void {
  if (!isKeyToken(value)) {
    throw new StellarBooksValidationError('invalid key component', [
      { code: 'KEY_TOKEN_INVALID', message: `${what} "${value}" must match [A-Za-z0-9._-]{1,64}` },
    ]);
  }
}

/**
 * Builds the source key for an entry derived from chain data.
 *
 * @param source - Position of the economic event.
 * @param ruleId - ID of the mapping rule that produced the entry.
 * @throws {@link StellarBooksValidationError} for an invalid position or rule ID.
 */
export function chainSourceKey(source: SourcePosition, ruleId: string): string {
  const issues = validateSourcePosition(source);
  if (issues.length > 0) throw new StellarBooksValidationError('invalid source position', issues);
  requireToken('rule id', ruleId);
  const op = source.opIndex === null ? '-' : String(source.opIndex);
  return `chain/${source.network}/${source.ledger}/${source.txHash}/${source.stage}/${op}/${source.eventIndex}/${ruleId}`;
}

/**
 * Builds a posting key from a source key and rule-set version.
 *
 * @param sourceKey - Source key from {@link chainSourceKey} or {@link manualSourceKey}.
 * @param ruleSetVersion - Version of the rule set used.
 */
export function postingKey(sourceKey: string, ruleSetVersion: string): string {
  requireToken('rule set version', ruleSetVersion);
  return `${sourceKey}@${ruleSetVersion}`;
}

/**
 * Builds the key of the entry that reverses the entry with posting key `reversedPostingKey`.
 * An entry can be reversed at most once, because storage enforces uniqueness of this key.
 *
 * @param reversedPostingKey - Posting key of the entry being reversed.
 */
export function reversalKey(reversedPostingKey: string): string {
  if (reversedPostingKey === '') {
    throw new StellarBooksValidationError('invalid reversal', [
      { code: 'KEY_EMPTY', message: 'posting key must not be empty' },
    ]);
  }
  return `reversal/${reversedPostingKey}`;
}

/**
 * Builds the source key for a manual (non-chain) entry, such as an opening balance or an accrual.
 *
 * @param id - Caller-chosen unique ID.
 */
export function manualSourceKey(id: string): string {
  requireToken('manual entry id', id);
  return `manual/${id}`;
}
