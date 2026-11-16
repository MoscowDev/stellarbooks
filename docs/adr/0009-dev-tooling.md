# ADR-0009: Lint, format and CI tooling; audit exception policy

- Status: Accepted
- Date: 2026-11-16

## Context

ADR-0007 left the linter, formatter and CI actions to be chosen at the start of Phase 2, after
reading their documentation and installed types.

## Decision

| Package / action                 | Version | Licence | Why                                                                                                                              |
| -------------------------------- | ------- | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| eslint + @eslint/js              | 10.15.0 / 10.0.1 | MIT | Standard JS/TS linter. Flat config via `defineConfig` (typescript-eslint getting-started docs).                     |
| typescript-eslint                | 8.72.2  | MIT     | Typed rules (`strictTypeChecked`, `stylisticTypeChecked`) with `projectService`. Peer TS `<6.1.0` matches the TS 6.0.3 pin.     |
| globals                          | 17.14.0 | MIT     | Node globals for ESLint.                                                                                                         |
| prettier                         | 3.10.1  | MIT     | Formatting, so that style is never a review topic.                                                                              |
| @types/node                      | 22.20.5 | MIT     | Matches the Node 22 runtime floor.                                                                                               |
| actions/checkout                 | v7.0.1  | MIT     | CI checkout, pinned by commit SHA.                                                                                               |
| pnpm/action-setup                | v6.1.1  | MIT     | Installs the pnpm version from `packageManager`, pinned by SHA.                                                                  |
| actions/setup-node               | v7.1.0  | MIT     | Node from `.nvmrc` with pnpm cache, pinned by SHA.                                                                               |

**Architecture enforcement in lint:** `packages/core/src` may not import Node built-ins, `pg`,
`@stellar/*` or other workspace packages, and may not use `parseFloat` or `process` (ADR-0002,
ADR-0004). Repository-structure tests enforce the same rules.

**Audit policy:**

- CI runs `pnpm audit --audit-level moderate` on all dependencies.
- An advisory may be ignored only if all of these hold:
  1. it affects dev-only tooling, not published code;
  2. no fixed version exists within the range the dependent package declares;
  3. the exception is commented in `pnpm-workspace.yaml` and recorded here and in OPEN-QUESTIONS.

**Current exception:**

- `GHSA-g3hv-75wg-m249`: minimatch < 11.0.1, a denial of service from attacker-controlled glob
  patterns. It reaches us through typedoc (`^10.2.5`) and @typescript-eslint/typescript-estree
  (`^10.2.2`).
- **Why not override:** minimatch 11 removes `makeRe()` and other APIs (minimatch changelog), and
  typedoc's dist references them. Forcing 11 risks breaking the docs build.
- **Why it is low risk:** the vulnerable code only processes glob patterns written in this
  repository's configs.
- **Remove** the exception when the dependents upgrade (tracked as Q-006).

## Consequences

A transitive advisory with no compatible fix does not block development, and every exception stays
visible and justified. `pnpm audit --prod` (published dependencies only) currently reports no
vulnerabilities.
