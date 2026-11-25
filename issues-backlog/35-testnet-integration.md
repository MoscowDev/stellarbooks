# Add an opt-in testnet integration test for RpcLedgerSource

**Complexity** Medium

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). The RPC test in `packages/stellar-ingest/test/rpc-source.test.ts` mocks `getLedgers`. Nothing checks the adapter against a real RPC.

## Scope

Add a test that runs only when `STELLARBOOKS_TESTNET_RPC_URL` is set. It reads a short recent range and checks contiguity and header agreement. Add a scheduled (not per-PR) CI job for it.

## Where

`packages/stellar-ingest/test`, `.github/workflows`

## Acceptance criteria

- The test is skipped without the environment variable.
- The scheduled job pins actions by commit SHA like the existing workflow.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- The test checks sequence contiguity and that each header hash matches the RPC response.
- Run the repository typecheck, lint, and tests.
