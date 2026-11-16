# Research: Postgres clients, migrations, testing and docs tooling

Retrieved 2026-11-16. Versions, licences, engines, dist-tags and publish dates come from the
npm registry (`npm view <pkg> ...`). Release counts are the number of versions published between
2025-11-16 and 2026-11-16, taken from `npm view <pkg> time`. Weekly downloads come from
`https://api.npmjs.org/downloads/point/last-week/<pkg>`. Neither count was checked against GitHub
activity (the `gh` CLI was not authenticated), so treat them as rough maintenance signals.

## 1. PostgreSQL clients

| | `pg` (node-postgres) | `postgres` (Postgres.js) |
|---|---|---|
| Latest | **8.23.1** (2026-09-30) | **4.1.1** (2026-11-11) |
| Licence | MIT | Unlicense |
| Node engines | `>= 16.0.0` | `>=18` |
| Module format | CJS main, with an ESM wrapper (`exports["."].import` → `./esm/index.mjs`) | ESM only (`"type": "module"`). README: `require('postgres').default` works on Node 20.19 / 22.12+ |
| TS types | Not bundled. Use **`@types/pg` 8.23.1** (MIT, DefinitelyTyped) | Bundled (`types/index.d.ts`) |
| Releases in last 12 months | 10 | 5 (3.4.9 on 2026-04-05, then 4.0.0 on 2026-10-29, 4.1.0, 4.1.1) |
| Weekly downloads | ~100.3 M | ~39.6 M |
| Maintainers | brianc + others (repo `brianc/node-postgres`) | single npm maintainer (`porsager`) |

### Facts relevant to StellarBooks

`pg`:
- Transactions: "You must use the same client instance for all statements within a transaction." "Do not use transactions with the pool.query method." node-postgres "doesn't provide any higher level abstractions specifically around transactions". You send BEGIN/COMMIT/ROLLBACK yourself (node-postgres.com/features/transactions).
- Types: values without a registered parser are returned as strings ("convert a database type to a JavaScript string if it doesn't have a registered type parser", node-postgres.com/features/types). In the installed `pg-types@2.2.0`, `int8` (OID 20) is registered with a parser that returns the **string** (`parseBigInteger`). Text-mode `numeric` (OID 1700) has no parser, so it is also returned as a string. Both are safe for exact amounts. We convert to `bigint` ourselves.
- Features listed in the README: pooling, parameterized queries, named prepared statements, LISTEN/NOTIFY, COPY (via the extra package).

`postgres` v4:
- Tagged-template API; `sql.begin(async sql => ...)` reserves a connection and rolls back automatically.
- v4 is a **new major (2026-10-29)**. README "Upgrading from v3" says: "parameter types are now decided by the server". A JS `bigint` parameter is no longer typed `int8` client-side. Example error: ``${ 2n ** 60n } + 1`` → `22003 out of range for type integer` unless cast (`::int8`). `sql.array()` is removed. Transactions are stricter (e.g. `UNSAFE_TRANSACTION` for a stray `begin`).
- `bigint` columns are returned as strings unless the `postgres.BigInt` custom type is configured. "`numeric` / `decimal` ... will be returned as a `string`".

## 2. Query builder (optional)

| | `kysely` |
|---|---|
| Latest | 0.29.9 (2026-11-12); also `release-0.28` = 0.28.20, `next` = 0.30.0-beta.2 |
| Licence | MIT |
| Engines | `>=22.0.0` |
| Format | ESM (`"type": "module"`); includes `kysely/migration` |
| Activity | 26 releases / 12 months; ~30.6 M weekly downloads |

Still pre-1.0. Breaking changes between 0.x minors are possible (inferred from semver 0.x, not verified).

## 3. Migration tools

| | `node-pg-migrate` | `graphile-migrate` |
|---|---|---|
| Latest | **9.0.0** (`alpha` = 10.0.0-alpha.7, 2026-10-22) | **1.4.1** (`rc` = 2.0.0-rc.6) |
| Licence | MIT | MIT |
| Engines | `>=20.11.0` | not declared |
| Format / types | ESM, bundled `.d.ts` (`dist/bundle/index.d.ts`), CLI `node-pg-migrate` | — |
| Peer deps | `pg: >=4.3.0 <9.0.0`, `@types/pg: >=6.0.0 <9.0.0` (so it is tied to `pg`) | — |
| Releases in last 12 months | 17 | 4 |
| Weekly downloads | ~1.28 M | ~87 k |

Notes: node-pg-migrate supports JS/TS migration files and also raw SQL via `pgm.sql(...)`
(the README was not re-read this pass; see Open questions). graphile-migrate is SQL-first
("current.sql" workflow); its stable line is 1.x with 2.0 in RC.

## 4. Testing and docs

| Package | Latest | Licence | Engines / peers | Notes |
|---|---|---|---|---|
| `vitest` | **5.1.0** (2026-11-02) | MIT | node `^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0`. Peer `vite ^6.4 \|\| ^7 \|\| ^8`, `@types/node ^22 \|\| >=24` | `@vitest/coverage-v8` 5.1.0. 50 releases / 12 months |
| `fast-check` | **4.10.2** (2026-09-19) | MIT | node `>=12.17.0`. Sole dependency `pure-rand ^8` | Dual ESM/CJS with types. 12 releases / 12 months |
| `typedoc` | **0.28.20** (2026-07-05) | Apache-2.0 | node `>= 18`, `pnpm >= 10`. **Peer `typescript` 5.0.x – 6.0.x** | 6 releases / 12 months |
| `typescript` (context) | 7.0.2 latest. `beta` 7.1.0-beta | Apache-2.0 | — | **TypeDoc 0.28.20 does not declare support for TS 7** |

## 5. Recommendation

1. **DB client: `pg` 8.x + `@types/pg`.**
   - It is the most widely used and longest-maintained client, with a steady release cadence.
   - It is MIT-licensed, the most conventional licence for consumers.
   - It is the peer that node-pg-migrate requires.
   - Its explicit-client transaction model maps directly onto "one ingestion unit = one transaction" with retry on 40001/40P01.
   - Its default of returning `int8`/`numeric` as strings is what we want for exact amounts.
   - `postgres` v4 is technically attractive (bundled types, `sql.begin`), but it shipped a breaking major only 18 days ago, has a single maintainer, and changed bigint parameter typing in ways that directly affect amount handling.
   - Architectural hedge: StellarBooks' storage layer should depend on a minimal internal `SqlExecutor` interface (`query(text, params)`, `transaction(fn)`). That way a `postgres` or Kysely adapter can be added later without touching core logic.
2. **Migrations: `node-pg-migrate` 9.x, using raw-SQL migrations (`pgm.sql`)**. Constraint triggers, REVOKEs and PL/pgSQL functions are easiest to review as plain SQL. Consider shipping the schema as versioned `.sql` files that the library can also apply itself. Plain SQL files are the dependency-free alternative if consumers use their own migration tool.
3. **Tests: `vitest` 5.1.x + `fast-check` 4.x.** Both are MIT and actively maintained. Vitest's engine range matches the Node 22 baseline (22.12+). Property-based tests fit invariants like "every generated entry balances per asset" and "re-ingesting is idempotent".
4. **API docs: `typedoc` 0.28.x, with TypeScript pinned to 6.0.x** until TypeDoc declares TS 7 support (see Open questions).

## Sources

- npm registry metadata via `npm view` for `pg`, `@types/pg`, `postgres`, `kysely`, `node-pg-migrate`, `graphile-migrate`, `fast-check`, `vitest`, `@vitest/coverage-v8`, `typedoc`, `typescript` — https://www.npmjs.com/ — retrieved 2026-11-16
- npm downloads API https://api.npmjs.org/downloads/point/last-week/{pkg} — retrieved 2026-11-16
- Installed `pg@8.23.1` README, `pg-types@2.2.0` (`lib/textParsers.js`, README), `postgres@4.1.1` README — retrieved 2026-11-16
- https://node-postgres.com/features/transactions — retrieved 2026-11-16
- https://node-postgres.com/features/types — retrieved 2026-11-16

## Open questions

1. TypeScript version: TS 7.0.2 is latest, but TypeDoc 0.28.20's peer range stops at 6.0.x. Should we pin TS 6.0.x, or use a different doc generator / wait for TypeDoc support?
2. node-pg-migrate's `pg` peer range is `<9.0.0`. If `pg` 9 ships, the migration tool may lag. Is there a `pg` 9 on the roadmap? (Not checked.)
3. node-pg-migrate 10.0.0 is in alpha. Check its breaking changes before adopting 9.x long-term (README and changelog not read this pass).
4. Should StellarBooks own its migrations, or ship SQL for consumers to apply with their own tool? This affects whether node-pg-migrate is a runtime dependency, a dev dependency or a CLI peer.
5. Maintenance signals are npm-only (release counts, downloads). GitHub issue and PR activity was not checked because `gh` was unauthenticated.
6. Licence check: `postgres` is "Unlicense". Confirm this is acceptable if we ever ship an adapter for it.
