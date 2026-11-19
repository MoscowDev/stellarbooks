# Verify both wallet perspectives of the captured XLM payment

**Complexity** Medium

## Context

The raw fixture verifies the outgoing payment and fee with only the sender tracked.

## Scope

Extend the fixture assertions to cover the recipient independently and both accounts tracked together.

## Where

`packages/stellar-ingest/test/ingest.test.ts`

## Acceptance criteria

- Assert the recipient’s exact 10,000,000-stroop receipt, sender-only fee, and zero consolidated internal transfer clearing balance.
- Describe the demonstrated behavior in the package documentation.

## Test expectations

- Add a regression assertion for the acceptance criteria.
- Run the repository typecheck, lint, and tests.
