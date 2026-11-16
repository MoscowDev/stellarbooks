/**
 * Journal entries and their invariants.
 *
 * Amounts are signed: **debits are positive, credits are negative**. A valid entry sums to zero
 * separately for every asset (ADR-0005). Entries are immutable once posted, and corrections are
 * made with reversing entries (ADR-0006).
 *
 * @module
 */
import { findAccount, type ChartOfAccounts } from './account.js';
import { isAccountAddress, isCounterpartyAddress } from './address.js';
import { I128_MAX, I128_MIN, type Amount } from './amount.js';
import { isAssetId, type AssetId } from './asset.js';
import { StellarBooksValidationError, type ValidationIssue } from './errors.js';
import { isUtcTimestamp } from './events.js';
import { validateSourcePosition, type SourcePosition } from './source.js';

/** One line of a journal entry. */
export interface JournalLine {
  /** Account code from the chart of accounts. */
  readonly account: string;
  /** Signed amount: positive is a debit, negative is a credit. Never zero. */
  readonly amount: Amount;
  /** Wallet sub-ledger: the Stellar account (`G...`) this line's value sits in, if any. */
  readonly wallet?: string;
  /** Other party, if known (`G...`, `M...` or `C...`). */
  readonly counterparty?: string;
  /** Free-text note for this line. */
  readonly note?: string;
}

/** A balanced journal entry. */
export interface JournalEntry {
  /** Idempotency key for this exact entry (see `posting-key.ts`). */
  readonly postingKey: string;
  /** Key of the fact this entry accounts for, independent of the rule-set version. */
  readonly sourceKey: string;
  /** Accounting date: ISO 8601 UTC timestamp, the ledger close time for chain entries. */
  readonly date: string;
  /** Human-readable description. */
  readonly description: string;
  /** Lines, in a deterministic order. At least two. */
  readonly lines: readonly JournalLine[];
  /** Ledger position of the underlying chain fact, for chain-derived entries. */
  readonly source?: SourcePosition;
  /** ID of the mapping rule that produced this entry. */
  readonly ruleId?: string;
  /** Version of the rule set that produced this entry. */
  readonly ruleSetVersion?: string;
  /** For a reversing entry: posting key of the entry it reverses. */
  readonly reverses?: string;
  /** Extra string metadata (for example memo or muxed ID). Keys are sorted on serialization. */
  readonly meta?: Readonly<Record<string, string>>;
}

/**
 * Sums line amounts per asset.
 *
 * @param lines - Lines to total.
 * @returns A map from asset to signed total. Zero totals are kept.
 */
export function totalsByAsset(lines: readonly JournalLine[]): Map<AssetId, bigint> {
  const totals = new Map<AssetId, bigint>();
  for (const line of lines) {
    totals.set(line.amount.asset, (totals.get(line.amount.asset) ?? 0n) + line.amount.units);
  }
  return totals;
}

/**
 * Validates a journal entry against the invariants and, if given, a chart of accounts.
 * The checks:
 * - there are at least two lines
 * - line amounts are non-zero and within the i128 range
 * - every asset balances to zero
 * - every account exists
 * - the date is valid
 * - any source position is valid
 *
 * @param entry - Entry to check.
 * @param chart - Chart of accounts, if account codes should be checked.
 * @returns Every issue found (empty if valid).
 */
export function validateEntry(entry: JournalEntry, chart?: ChartOfAccounts): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (entry.postingKey === '')
    issues.push({
      code: 'ENTRY_KEY_EMPTY',
      message: 'postingKey must not be empty',
      path: 'postingKey',
    });
  if (entry.sourceKey === '')
    issues.push({
      code: 'ENTRY_KEY_EMPTY',
      message: 'sourceKey must not be empty',
      path: 'sourceKey',
    });
  if (!isUtcTimestamp(entry.date))
    issues.push({
      code: 'ENTRY_DATE_INVALID',
      message: `date "${entry.date}" is not ISO 8601 UTC`,
      path: 'date',
    });
  if (entry.description.trim() === '')
    issues.push({
      code: 'ENTRY_DESCRIPTION_EMPTY',
      message: 'description must not be empty',
      path: 'description',
    });
  if (entry.source !== undefined) issues.push(...validateSourcePosition(entry.source, 'source'));
  if (entry.lines.length < 2)
    issues.push({
      code: 'ENTRY_TOO_FEW_LINES',
      message: 'an entry needs at least two lines',
      path: 'lines',
    });
  entry.lines.forEach((line, i) => {
    const p = `lines[${i}]`;
    if (!isAssetId(line.amount.asset))
      issues.push({
        code: 'LINE_ASSET_INVALID',
        message: `invalid asset "${String(line.amount.asset)}"`,
        path: `${p}.amount.asset`,
      });
    if (line.amount.units === 0n)
      issues.push({
        code: 'LINE_AMOUNT_ZERO',
        message: 'line amount must not be zero',
        path: `${p}.amount.units`,
      });
    if (line.amount.units > I128_MAX || line.amount.units < I128_MIN) {
      issues.push({
        code: 'LINE_AMOUNT_OUT_OF_RANGE',
        message: 'line amount outside i128 range',
        path: `${p}.amount.units`,
      });
    }
    if (chart !== undefined && findAccount(chart, line.account) === undefined) {
      issues.push({
        code: 'LINE_ACCOUNT_UNKNOWN',
        message: `account "${line.account}" is not in the chart`,
        path: `${p}.account`,
      });
    }
    if (line.wallet !== undefined && !isAccountAddress(line.wallet)) {
      issues.push({
        code: 'LINE_WALLET_INVALID',
        message: 'wallet must be a G... address',
        path: `${p}.wallet`,
      });
    }
    if (line.counterparty !== undefined && !isCounterpartyAddress(line.counterparty)) {
      issues.push({
        code: 'LINE_COUNTERPARTY_INVALID',
        message: 'invalid counterparty address',
        path: `${p}.counterparty`,
      });
    }
  });
  for (const [asset, total] of totalsByAsset(entry.lines)) {
    if (total !== 0n) {
      issues.push({
        code: 'ENTRY_UNBALANCED',
        message: `asset ${asset} sums to ${total}, expected 0`,
        path: 'lines',
      });
    }
  }
  return issues;
}

/**
 * Throws if the entry is invalid; see {@link validateEntry}.
 *
 * @param entry - Entry to check.
 * @param chart - Optional chart of accounts.
 * @throws {@link StellarBooksValidationError} listing every issue.
 */
export function assertValidEntry(entry: JournalEntry, chart?: ChartOfAccounts): void {
  const issues = validateEntry(entry, chart);
  if (issues.length > 0)
    throw new StellarBooksValidationError(`invalid journal entry ${entry.postingKey}`, issues);
}

function canonicalValue(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = canonicalValue(v);
    }
    return out;
  }
  return value;
}

/**
 * Serializes an entry to a canonical JSON string: object keys sorted, bigints as decimal strings,
 * `undefined` fields omitted, and line order preserved. Equal entries always produce identical
 * strings, so storage can hash this to detect a replay that changes content (ADR-0006).
 *
 * @param entry - Entry to serialize.
 */
export function canonicalEntryJson(entry: JournalEntry): string {
  return JSON.stringify(canonicalValue(entry));
}
