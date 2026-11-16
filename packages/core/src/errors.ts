/**
 * A single problem found while validating domain data. Validation functions collect every issue
 * rather than stopping at the first, so callers can report everything that is wrong at once.
 */
export interface ValidationIssue {
  /** Stable machine-readable code, for example `ENTRY_UNBALANCED`. */
  readonly code: string;
  /** Human-readable explanation. Never contains secrets. */
  readonly message: string;
  /** Optional location of the problem, for example `lines[2].amount`. */
  readonly path?: string;
}

/**
 * Thrown when domain data is invalid. Carries every {@link ValidationIssue} that was found.
 */
export class StellarBooksValidationError extends Error {
  /** All issues found, in the order they were detected. */
  readonly issues: readonly ValidationIssue[];

  /**
   * @param message - Summary of what was being validated.
   * @param issues - The issues found; must not be empty.
   */
  constructor(message: string, issues: readonly ValidationIssue[]) {
    super(
      `${message}: ${issues.map((i) => `${i.code}${i.path ? ` at ${i.path}` : ''}: ${i.message}`).join('; ')}`,
    );
    this.name = 'StellarBooksValidationError';
    this.issues = issues;
  }
}

/**
 * Throws {@link StellarBooksValidationError} if `issues` is not empty.
 *
 * @param what - Description used as the error message prefix.
 * @param issues - Issues returned by a validation function.
 */
export function throwIfIssues(what: string, issues: readonly ValidationIssue[]): void {
  if (issues.length > 0) throw new StellarBooksValidationError(what, issues);
}
