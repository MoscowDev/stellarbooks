# Validate StrKey checksums in core

**Complexity** Medium

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). `core` checks address prefix, length and base32 only (Q-033). Checksums are verified only in `stellar-ingest` through the SDK, because `core` has no runtime dependencies.

## Scope

Implement the StrKey CRC16 checksum in `core` following the official StrKey specification, or record in an ADR why `core` should not.

## Where

`packages/core/src/address.ts`

## Acceptance criteria

- Valid G, M and C addresses pass, and any single-character change fails.
- Q-033 is updated.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Property test comparing the core result with the SDK `StrKey` result on generated keys (SDK as a dev dependency only).
- Run the repository typecheck, lint, and tests.
