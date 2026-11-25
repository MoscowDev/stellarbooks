# Demonstrate account statements across two assets

**Complexity** Trivial

**GitHub issue** [#3](https://github.com/MoscowDev/stellarbooks/issues/3) (first Wave)

## Context

Account statements are implemented and need an example with quiet periods and multiple assets.

## Scope

Add a runnable example and regression coverage for two assets with no postings within the statement interval.

## Where

`packages/reports/test/reports.test.ts`

## Acceptance criteria

- Both asset balances carry forward as opening and closing balances and the statement has no activity rows.
- Describe the demonstrated behavior in the package documentation.

## Test expectations

- Add a regression assertion for the acceptance criteria.
- Run the repository typecheck, lint, and tests.
