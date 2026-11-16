/**
 * Reversing entries: the only way to correct a posted entry (ADR-0006).
 *
 * @module
 */
import { negate } from './amount.js';
import { StellarBooksValidationError } from './errors.js';
import { isUtcTimestamp } from './events.js';
import type { JournalEntry } from './journal.js';
import { reversalKey } from './posting-key.js';

/** Options for {@link reverseEntry}. */
export interface ReverseOptions {
  /** Accounting date of the reversal, ISO 8601 UTC. Usually the correction date, not the original date. */
  readonly date: string;
  /** Why the entry is being reversed. Recorded in the description and in `meta.reason`. */
  readonly reason: string;
}

/**
 * Creates the entry that exactly cancels `original`: same accounts, same order, every amount
 * negated. The original and its reversal net to zero for every account and asset.
 *
 * @param original - Posted entry to reverse.
 * @param options - Date and reason for the reversal.
 * @throws {@link StellarBooksValidationError} if the date or reason is invalid, or if `original`
 *   is itself a reversal. Re-post a corrected entry instead of reversing a reversal.
 */
export function reverseEntry(original: JournalEntry, options: ReverseOptions): JournalEntry {
  const issues = [];
  if (!isUtcTimestamp(options.date))
    issues.push({
      code: 'REVERSAL_DATE_INVALID',
      message: `date "${options.date}" is not ISO 8601 UTC`,
    });
  if (options.reason.trim() === '')
    issues.push({ code: 'REVERSAL_REASON_EMPTY', message: 'reason must not be empty' });
  if (original.reverses !== undefined) {
    issues.push({
      code: 'REVERSAL_OF_REVERSAL',
      message: 'reversing a reversal is not allowed; post a corrected entry instead',
    });
  }
  if (issues.length > 0)
    throw new StellarBooksValidationError(`cannot reverse ${original.postingKey}`, issues);
  const key = reversalKey(original.postingKey);
  return {
    postingKey: key,
    sourceKey: key,
    date: options.date,
    description: `Reversal of ${original.postingKey}: ${options.reason}`,
    lines: original.lines.map((line) => ({ ...line, amount: negate(line.amount) })),
    reverses: original.postingKey,
    meta: { reason: options.reason },
  };
}
