# @stellarbooks/reports

Use `generalLedger(entries, accountCode)` for dated debit, credit and running balance rows.
Supply the full journal history for the account when computing running balances from zero.
Use `balanceSnapshot(entries, options)` for signed balances and `trialBalance(entries, options)`
for separate debit and credit columns. All amounts are bigint minor units in the row's asset.
Provide entries from a single book to each report.

`accountStatement(entries, accountCode, fromDate, toDate)` reports inclusive activity and
per-asset opening and closing balances. Include all earlier entries to compute opening balances.
`toJson(report)` writes decimal strings for bigint fields. For tabular exports, call
`toCsv(rows, columns)` with explicit column order. CSV field values support text, bigint,
booleans, and empty values.

By default, `toCsv` prefixes text cells that start with `=`, `+`, `-`, `@`, a tab, a line break, or
a full-width form of those signs with `'`, so a spreadsheet does not run attacker-supplied text such
as a Stellar memo as a formula. Numbers, including negative bigint amounts and plain numeric text,
are left unchanged. Pass `{ escapeFormulas: false }` when a program, not a spreadsheet, reads the
file. See [report export research](../../docs/research/report-exports.md#csv-formula-injection).

Use `valueAmount(amount, quoteAsset, asOf, source, rounding)` with a caller-provided
price source. Quote ratios express quote minor units per base minor unit. Choose
`toward-zero` or `half-away-from-zero` rounding. The valuation contains its original
amount, exact rate, source, observation time and cutoff. Missing quotes return `null`.

`manualPriceSource(quotes)` builds a source from local quotes. It selects the newest
observation at or before the cutoff for the exact requested pair and rejects duplicate
observation times within a pair.

Licensed under MIT. See [LICENSE](../../LICENSE).
