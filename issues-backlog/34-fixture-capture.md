# Capture real testnet transactions in tools/fixture-gen

**Complexity** High

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). `tools/fixture-gen/src/generate.ts` only connects to testnet and prints the latest ledger. Q-019 approved creating throwaway Friendbot accounts, with secret keys kept in memory only and never logged or written. Q-035 needs real fixtures per operation type.

## Scope

Create Friendbot-funded accounts, submit one transaction per supported operation, wait for it to close, fetch the ledger with `getLedgers`, and write the raw XDR plus ledger number and capture date under `fixtures/data`.

## Where

`tools/fixture-gen/src`, `fixtures/data`, `fixtures/README.md`

## Acceptance criteria

- The tool refuses any network other than testnet (keep the existing guard).
- No secret key is printed, logged or written to disk.
- Each output file records network, ledger, transaction hash and capture date.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- A unit test for the testnet guard with a mocked RPC.
- A test that scans generated files for secret seeds (StrKey `S` prefix).
- Run the repository typecheck, lint, and tests.
