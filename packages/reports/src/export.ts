/** Serializes a report to JSON with bigint minor units represented as decimal strings. */
export function toJson(report: object): string {
  return JSON.stringify(report, (_key: string, value: unknown) =>
    typeof value === 'bigint' ? value.toString() : value,
  );
}

/** Options for {@link toCsv}. */
export interface CsvOptions {
  /**
   * Prefix text cells that a spreadsheet could evaluate as a formula with a single quote
   * (`'`). Defaults to `true`. Set to `false` only when the file is consumed by a program
   * rather than opened in a spreadsheet, because the prefix becomes part of the cell text.
   *
   * Bigint and boolean cells, and text cells that are plain decimal numbers such as `-100`
   * or `-1.5`, are never prefixed.
   */
  readonly escapeFormulas?: boolean;
}

/**
 * Serializes tabular report rows with explicit column order and decimal bigint fields.
 *
 * Output follows RFC 4180 (CRLF line endings, quoted fields, doubled interior quotes). By
 * default, text cells that begin with `=`, `+`, `-`, `@`, a tab, a carriage return, a line
 * feed, or a full-width `＝`, `＋`, `－` or `＠` are prefixed with `'` to reduce CSV formula
 * injection from untrusted text such as Stellar memos (OWASP "CSV Injection").
 */
export function toCsv<Row extends object>(
  rows: readonly Row[],
  columns: readonly (keyof Row & string)[],
  options: CsvOptions = {},
): string {
  const escapeFormulas = options.escapeFormulas ?? true;
  const field = (value: unknown): string => csvField(value, escapeFormulas);
  const lines = [
    columns.map(field).join(','),
    ...rows.map((row) => columns.map((column) => field(row[column])).join(',')),
  ];
  return lines.join('\r\n') + '\r\n';
}

const FORMULA_TRIGGER = /^[=+\-@\t\r\n＝＋－＠]/u;
const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/u;

function csvField(value: unknown, escapeFormulas: boolean): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string' && typeof value !== 'bigint' && typeof value !== 'boolean') {
    throw new TypeError('CSV fields must be text, bigint, boolean, or empty');
  }
  let field = String(value);
  if (
    escapeFormulas &&
    typeof value === 'string' &&
    FORMULA_TRIGGER.test(field) &&
    !PLAIN_NUMBER.test(field)
  ) {
    field = "'" + field;
  }
  return /[",\r\n]/.test(field) ? '"' + field.replaceAll('"', '""') + '"' : field;
}
