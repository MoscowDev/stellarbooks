# Test bounded RPC ledger pagination

**Complexity** Medium

**GitHub issue** [#1](https://github.com/MoscowDev/stellarbooks/issues/1) (first Wave)

## Context

The RPC source validates the sequence before decoding ledger transactions. This makes sequence validation testable with mocked RPC responses.

## Scope

Add mocked cases where the first returned sequence is below or above the requested start. Verify the error includes the expected and received sequence.

## Where

`packages/stellar-ingest/test/rpc-source.test.ts`

## Acceptance criteria

- Both cases fail with a sequence error before metadata decoding.
- Describe the demonstrated behavior in the package documentation.

## Test expectations

- Add a regression assertion for the acceptance criteria.
- Run the repository typecheck, lint, and tests.
