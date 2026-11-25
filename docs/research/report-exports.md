# Report export formats

Retrieved 2026-11-18.

- [RFC 4180](https://www.rfc-editor.org/info/rfc4180/) specifies CRLF record separators, quoted fields for commas or line breaks, and doubled interior quotes.
- [RFC 8259](https://www.rfc-editor.org/info/rfc8259/) describes interoperability limits for large JSON numbers. Encode bigint minor units as decimal strings in JSON.
- The existing [accounting research](accounting.md) describes account balances and dated ledger activity. A statement uses the balance before the inclusive start and includes activity through the inclusive end.

## CSV formula injection

Retrieved 2026-11-25 from [OWASP: CSV Injection](https://community.owasp.org/attacks/CSV_Injection)
(redirected from `owasp.org/www-community/attacks/CSV_Injection`).

- Cells must not begin with `=`, `+`, `-`, `@`, tab (0x09), carriage return (0x0D) or line feed
  (0x0A), or the full-width forms `＝`, `＋`, `－`, `＠`.
- Generic mitigation: wrap the field in double quotes, prepend a single quote, and double interior
  quotes. OWASP notes this is "not reliable in Microsoft Excel after saving and re-opening the CSV
  file".
- Excel-specific alternative: prefix with a tab inside the quoted field. The tab remains in the data
  and may affect programmatic consumers.
- The page does not discuss numeric values such as negative amounts.

**Decision (implemented in `toCsv`):** text cells that start with a trigger character get a `'`
prefix by default. Bigint and boolean cells are never prefixed. Text that is a plain decimal number
(`/^[+-]?\d+(\.\d+)?$/`, for example `-100`) is not prefixed, because spreadsheets read it as a
number, not a formula; this exemption is our inference (Q-040). Callers that feed CSV to programs
can pass `{ escapeFormulas: false }` to keep the exact text.

