# Decide how to book issuance and redemption for issuer wallets

**Complexity** High

## Context

This is part of the [StellarBooks roadmap](../docs/ROADMAP.md). When a tracked wallet is the issuer of an asset, payments from it create supply and payments to it destroy supply. The issuer has no trustline, so meta shows no balance change for it (Q-031). `core` has no event kind for this yet.

## Scope

Write an ADR comparing options (for example an outstanding-supply liability account), then add the chosen event kind and default template rules.

## Where

`packages/core/src/events.ts`, `packages/core/src/templates.ts`, `docs/adr/`, `docs/ACCOUNTING-RULES.md`

## Acceptance criteria

- An ADR records the decision and Q-031 is updated.
- Issuing and redeeming an asset produce balanced entries under every built-in template.
- `docs/ACCOUNTING-RULES.md` documents the treatment.
- Update the relevant package and mapping documentation for the behavior delivered.

## Test expectations

- Unit and property tests for the new event kind.
- A fixture where a tracked issuer pays a holder and receives the asset back.
- Run the repository typecheck, lint, and tests.
