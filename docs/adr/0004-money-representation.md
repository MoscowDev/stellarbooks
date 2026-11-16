# ADR-0004: Money is integer minor units (bigint), with per-asset scale

- Status: Proposed (pending Phase 1 approval)
- Date: 2026-11-16

## Context
- **Classic amounts:** int64 stroops, 7 decimal places, max 922,337,203,685.4775807
  (docs/research/stellar-accounts-assets.md).
- **Soroban token amounts:** `i128`, with decimals declared by `decimals()` (SEP-41,
  docs/research/seps.md).
- **Database:** PostgreSQL `numeric` is exact. `bigint` cannot hold i128 (docs/research/postgresql.md).
- **SDK:** decodes integers to `bigint` in v17.

## Decision
- **In code:** every amount is a `bigint` of minor units, wrapped in an `Amount` value type that
  carries an `AssetId`. There are no floats and no `number` anywhere in a money path, and a lint rule
  bans `parseFloat`, `Number(` and `Math.*` in money code.
- **Asset identity:**
  - `native`
  - `classic:CODE:ISSUER` (alphanum4/12)
  - `pool:<poolIdHex>` for pool shares
  - `sep41:<C...>` for contract tokens
- **Scale:**
  - Classic, native and pool shares are 7 by protocol.
  - SEP-41 tokens use the contract's `decimals()`, captured once and recorded with provenance (see
    Q-020).
- **Database:** amounts are stored as `numeric(39,0)` with `CHECK (amount <> 0)`. 39 digits covers
  the i128 range.
- **Formatting and parsing:** decimal strings are converted only at the edges (CLI, reports), using
  integer string arithmetic.

## Consequences
Exact arithmetic everywhere. `pg` returns `numeric` as strings, which we convert to `bigint`
explicitly.
