# ADR-0002: TypeScript pnpm monorepo, Node 22.12+, TypeScript 6.0.x

- Status: Accepted
- Approved: 2026-11-16 (maintainer approved PLAN.md with defaults)
- Date: 2026-11-16

## Context
- The brief asks for a TypeScript monorepo with `core`, `stellar-ingest`, `storage-postgres`,
  `reports` and `cli` packages.
- `@stellar/stellar-sdk` 17.x requires Node >= 22.12.0 (docs/research/stellar-js-sdk.md).
- TypeDoc 0.28.20's TypeScript peer range stops at 6.0.x, while the latest TypeScript is 7.0.2
  (docs/research/tooling-libraries.md).
- pnpm 11 is installed locally.

## Decision
- **Workspace:** pnpm workspaces, with exact pinned versions (`save-exact`) and a committed lockfile.
- **Runtime:** Node `>=22.12.0`, declared in `engines` and `.nvmrc`.
- **TypeScript:** pinned to the latest 6.0.x so that TypeDoc can generate the API reference. We move
  to 7.x when TypeDoc supports it, through a new ADR.
- **Packages:** published as ESM with type declarations. `strict`, `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes` are enabled.
- **Core has no I/O:** `packages/core` takes no Node built-ins and no network or database
  dependencies. A lint rule enforces this.

## Consequences
- We give up TypeScript 7 for now, and we must track TypeDoc's peer range.
- ESM-only packages may need consumers to use `import`. We will revisit this if embedding projects
  need CJS.

## Alternatives considered
- npm/yarn workspaces, Nx or Turborepo: more tooling than we need at this stage.
- TypeScript 7 with a different doc generator: TypeDoc is the de facto standard for TSDoc output.
