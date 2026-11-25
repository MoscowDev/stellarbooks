# Document exact report export round-trips

**Complexity** Trivial

**GitHub issue** [#4](https://github.com/MoscowDev/stellarbooks/issues/4) (first Wave)

## Context

Report exports preserve bigint minor units as decimal text.

## Scope

Add a runnable JSON consumer and cover exact reading of an amount above the JavaScript safe integer limit.

## Where

`packages/reports/test/reports.test.ts`

## Acceptance criteria

- The example reads a JSON report amount with BigInt and verifies it equals the source.
- Describe the demonstrated behavior in the package documentation.

## Test expectations

- Add a regression assertion for the acceptance criteria.
- Run the repository typecheck, lint, and tests.
