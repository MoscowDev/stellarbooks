/** Serializes a report to JSON with bigint minor units represented as decimal strings. */
export function toJson(report: object): string {
  return JSON.stringify(report, (_key: string, value: unknown) =>
    typeof value === 'bigint' ? value.toString() : value,
  );
}

/** Serializes tabular report rows with explicit column order and decimal bigint fields. */
export function toCsv<Row extends object>(
  rows: readonly Row[],
  columns: readonly (keyof Row & string)[],
): string {
  const lines = [
    columns.map(csvField).join(','),
    ...rows.map((row) => columns.map((column) => csvField(row[column])).join(',')),
  ];
  return lines.join('\r\n') + '\r\n';
}

function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string' && typeof value !== 'bigint' && typeof value !== 'boolean') {
    throw new TypeError('CSV fields must be text, bigint, boolean, or empty');
  }
  const field = String(value);
  return /[",\r\n]/.test(field) ? '"' + field.replaceAll('"', '""') + '"' : field;
}
