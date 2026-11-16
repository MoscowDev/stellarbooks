# Research: PostgreSQL features for a double-entry ledger

Retrieved 2026-11-16. All quotations come from the PostgreSQL documentation at
`https://www.postgresql.org/docs/current/...`, which served **PostgreSQL 18 (18.7)** on the
retrieval date. The versioning page lists 18 as the newest supported major version (18.7, released
2025-09-25, EOL 2030-11-14). Its news banner (2026-11-12) announces **"19 RC 2 Released!"**, so
PostgreSQL 19 GA is close. Supported majors: 14 (EOL 2026-11-12, per the table), 15, 16, 17, 18.

SQL in the "Design" sections is our own illustration and was not copied from the docs.

## 1. Numeric types and Stellar amounts

`numeric` (datatype-numeric.html):

- Range: "up to 131072 digits before the decimal point; up to 16383 digits after the decimal point."
- "The maximum precision that can be explicitly specified in a `numeric` type declaration is 1000." Scale may be -1000..1000.
- Exactness: "Calculations with `numeric` values yield exact results where possible, e.g., addition, subtraction, multiplication."
- Overflow: "if the number of digits to the left of the decimal point exceeds the declared precision minus the declared scale, an error is raised". Values with too many fractional digits are **rounded silently**, not rejected.
- Special values: `Infinity`, `-Infinity`, `NaN`. "an infinity can only be stored in an unconstrained `numeric` column". `NaN` is accepted even in constrained columns (inferred: the infinity restriction is the only one stated). Add `CHECK (amount <> 'NaN')` if needed.
- Performance: "calculations on `numeric` values are very slow compared to the integer types".

`bigint`: 8 bytes, "-9223372036854775808 to +9223372036854775807". For integer types, "Attempts to store values outside of the allowed range will result in an error."

Stellar comparison (see stellar-js-sdk.md section 7): classic amounts are signed int64 stroops (max
922,337,203,685.4775807 units = 9223372036854775807 stroops), which is exactly the `bigint` max.
**However**: (a) a *sum* of many int64 amounts can overflow `bigint`. `sum(bigint)` returns `numeric` per
PostgreSQL's aggregate docs (not re-verified this pass). (b) Soroban token amounts are `i128` and can exceed int64.

**Design: store amounts as integer minor units in `numeric(39,0)`.** That covers the i128 range,
which has 39 decimal digits. Keep the asset's decimals (7 for classic) as separate metadata. Never
store floats. Integer-only `numeric(p,0)` avoids the silent fractional rounding noted above.
Alternative: `bigint` for classic-only columns, which is faster but cannot hold Soroban i128 values.

## 2. Transactions and isolation (transaction-iso.html)

- "Read Committed is the default isolation level in PostgreSQL." Each statement sees a snapshot as of statement start. Concurrent updaters wait for the first to commit or roll back.
- Repeatable Read: snapshot taken at the first non-transaction-control statement. Conflicting writes fail with "could not serialize access due to concurrent update". "it should abort the current transaction and retry the whole transaction from the beginning." "read-only transactions will never have serialization conflicts."
- Serializable: "emulates serial transaction execution for all committed transactions". Failures "always return with an SQLSTATE value of '40001'". Serializable transactions that insert potentially conflicting keys should check first, because unique violations can occur that a serial run would not have produced.
- `SERIALIZABLE READ ONLY DEFERRABLE` blocks until it gets a safe snapshot, then can never fail. This fits consistent report or balance snapshots.

SQLSTATEs (errcodes-appendix.html): `40001` serialization_failure, `40P01` deadlock_detected,
`40002` transaction_integrity_constraint_violation, `23505` unique_violation, `23514` check_violation,
`23P01` exclusion_violation, `23503` foreign_key_violation, `23001` restrict_violation,
`P0001` raise_exception (default for PL/pgSQL `RAISE EXCEPTION`), `42501` insufficient_privilege, `55P03` lock_not_available.

Deadlocks (explicit-locking.html): "PostgreSQL automatically detects deadlock situations and resolves them by aborting one of the transactions involved".

**Design:** wrap every ingestion unit in one transaction, for example one ledger or one Stellar
transaction. That transaction writes the journal entry, its lines, and the cursor update. Retry the
whole unit on `40001` and `40P01` with backoff. Read Committed is enough for append-only inserts
guarded by unique constraints and an advisory lock (see sections 5 and 6). A failed deferred
constraint check at COMMIT surfaces as an error on `COMMIT`. The client must treat it as a
non-retryable integrity error.

## 3. Constraints

ddl-constraints.html:

- CHECK: "PostgreSQL does not support `CHECK` constraints that reference table data other than the new or updated row being checked." It also says "PostgreSQL assumes that `CHECK` constraints' conditions are immutable". So **a CHECK cannot enforce "lines sum to zero"**. The docs advise: "If possible, use `UNIQUE`, `EXCLUDE`, or `FOREIGN KEY` constraints to express cross-row and cross-table restrictions", or a trigger.
- UNIQUE: NULLs are distinct by default. Use `UNIQUE NULLS NOT DISTINCT` when nullable columns are part of an idempotency key.
- EXCLUDE: "if any two rows are compared on the specified columns or expressions using the specified operators, at least one of these operator comparisons will return false or null", e.g. `EXCLUDE USING gist (c WITH &&)`. This is useful for non-overlapping accounting periods. The page does not mention the extension needed for scalar equality in GiST (`btree_gist`); see Open questions.

sql-createtable.html, DEFERRABLE:

- "Currently, only `UNIQUE`, `PRIMARY KEY`, `EXCLUDE`, and `REFERENCES` (foreign key) constraints accept this clause. `NOT NULL` and `CHECK` constraints are not deferrable."
- "deferrable constraints cannot be used as conflict arbiters in an `INSERT` statement that includes an `ON CONFLICT` clause."
- `INITIALLY DEFERRED` means the check runs "only at the end of the transaction". `DEFERRABLE` unique checks "can be significantly slower than immediate uniqueness checking."
- PG 18 adds `ENFORCED | NOT ENFORCED`, "currently only supported for foreign key and `CHECK` constraints".

sql-set-constraints.html: `SET CONSTRAINTS { ALL | name [, ...] } { DEFERRED | IMMEDIATE }`.
Switching to IMMEDIATE "takes effect retroactively", so it can force a check before COMMIT.
"The firing of triggers that are declared as 'constraint triggers' is also controlled by this
setting". "`NOT NULL` and `CHECK` constraints are always checked immediately".

## 4. Constraint triggers: enforcing balanced entries at commit

sql-createtrigger.html:

- Syntax: `CREATE [ OR REPLACE ] [ CONSTRAINT ] TRIGGER name { BEFORE | AFTER | INSTEAD OF } { event [ OR ... ] } ON table_name [ FROM referenced_table_name ] [ NOT DEFERRABLE | [ DEFERRABLE ] [ INITIALLY IMMEDIATE | INITIALLY DEFERRED ] ] [ REFERENCING ... ] [ FOR [ EACH ] { ROW | STATEMENT } ] [ WHEN ( condition ) ] EXECUTE { FUNCTION | PROCEDURE } function_name ( arguments )`
- "Constraint triggers must be `AFTER ROW` triggers on plain tables (not foreign tables). They can be fired either at the end of the statement causing the triggering event, or at the end of the containing transaction; in the latter case they are said to be deferred."
- "Constraint triggers can only be specified `FOR EACH ROW`." Statement-level constraint triggers are not allowed.
- Transition tables (`REFERENCING NEW TABLE`): "The trigger should not be a constraint trigger." So a deferred trigger cannot see the batch of new rows as a set. It must re-query the table.
- `WHEN` on a constraint trigger "is not deferred, but occurs immediately after the row update operation is performed".
- "Currently, the `OR REPLACE` option is not supported for constraint triggers."
- "Constraint triggers are expected to raise an exception when the constraints they implement are violated."

**Design: deferred constraint trigger for "sum(amount) = 0 per (entry, asset)".**

```sql
CREATE FUNCTION ledger.assert_entry_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM ledger.entry_line
    WHERE entry_id = NEW.entry_id
    GROUP BY asset_id
    HAVING sum(amount) <> 0
  ) THEN
    RAISE EXCEPTION 'journal entry % is unbalanced', NEW.entry_id
      USING ERRCODE = 'check_violation';   -- or a custom SQLSTATE
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER entry_line_balanced
  AFTER INSERT ON ledger.entry_line
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger.assert_entry_balanced();
```

Considerations:

- The trigger fires once per inserted row at COMMIT. The check is O(lines²) per entry, which is
  acceptable for small entries. An index on `(entry_id, asset_id)` keeps each check cheap. A cheaper
  variant fires a deferred trigger on the *header* table (`journal_entry`) once per entry and checks
  all of that entry's lines. Header and lines must then be inserted in the same transaction, and the
  header must have at least 2 lines.
- If lines are append-only (section 7), only INSERT needs the trigger.
- Defence in depth: also validate balance in TypeScript before writing, and optionally route writes
  through a single PL/pgSQL function (`ledger.post_entry(header jsonb, lines jsonb)`). Run that
  function as `SECURITY DEFINER` and revoke direct INSERT from the app role.
- Per-line CHECKs (`amount <> 0`, `NOT NULL`) are immediate and cheap. Keep them.

## 5. Idempotency: `INSERT ... ON CONFLICT` (sql-insert.html)

- `ON CONFLICT [ conflict_target ] { DO NOTHING | DO UPDATE SET ... [ WHERE ... ] }`. The conflict_target is either a column/expression list (inferred unique index) or `ON CONSTRAINT name`. DO NOTHING may omit the target. DO UPDATE requires one.
- "only `NOT DEFERRABLE` constraints and unique indexes are supported as arbiters". Exclusion constraints are not supported with DO UPDATE.
- "`ON CONFLICT DO UPDATE` guarantees an atomic `INSERT` or `UPDATE` outcome ... even under high concurrency."
- RETURNING: "Only rows that were successfully inserted or updated will be returned". With DO NOTHING, conflicting rows are therefore not returned, so you have to SELECT the existing row afterwards. This is an inference from that sentence.
- Warning: during `CREATE INDEX CONCURRENTLY` / `REINDEX CONCURRENTLY` on the unique index, ON CONFLICT "may unexpectedly fail with a unique violation".

**Design:** give each journal entry a deterministic natural key, for example
`(network_passphrase_hash, tx_hash, source_kind, source_index)`. Declare it as a NOT DEFERRABLE UNIQUE
constraint. Insert headers with `ON CONFLICT (...) DO NOTHING RETURNING id`. If no row is returned, the
entry already exists and the line inserts are skipped. Never use DO UPDATE on ledger tables, because
that would violate append-only.

## 6. Advisory locks (explicit-locking.html, functions-admin.html)

- Session-level locks are held "until explicitly released or the session ends". They "do not honor transaction semantics", so a lock taken inside a rolled-back transaction stays held.
- Transaction-level locks (`pg_advisory_xact_lock`) "are automatically released at the end of the transaction, and there is no explicit unlock operation".
- Re-entrant: "for each completed lock request there must be a corresponding unlock request".
- Keys: "a single 64-bit key value or two 32-bit key values (note that these two key spaces do not overlap)".
- Functions: `pg_advisory_lock`, `pg_advisory_xact_lock`, `pg_try_advisory_lock`, `pg_try_advisory_xact_lock`, `_shared` variants, `pg_advisory_unlock`, `pg_advisory_unlock_all`. Each takes `(key bigint)` or `(key1 integer, key2 integer)`.
- Caution: do not combine `pg_advisory_lock(id)` with `LIMIT` in the same query level.
- With a transaction-pooling proxy (e.g. PgBouncer), session-level locks are unsafe. Prefer `pg_try_advisory_xact_lock` per batch. This is general practice and was not stated on these pages.

**Design:** at the start of each ingestion transaction, run `SELECT pg_try_advisory_xact_lock(<hash of (network, source)>)`.
This ensures only one ingestor advances a given cursor. Combine it with the unique keys from section 5
so that a duplicate run cannot double-post even if locking is misconfigured.

## 7. Append-only enforcement

- Privileges (ddl-priv.html, sql-revoke.html): `REVOKE UPDATE, DELETE, TRUNCATE ON ledger.entry_line FROM app_role;`. TRUNCATE is a separate privilege. Default privileges "always include all privileges for the owner". "An object's owner can choose to revoke their own ordinary privileges ... But owners are always treated as holding all grant options, so they can always re-grant their own privileges." Also, a role's effective privileges include those granted to PUBLIC and to roles it is a member of. **So the application must not connect as the table owner or a superuser.** Use a separate migration/owner role.
- Triggers, as a second layer that also applies to the owner. A `BEFORE UPDATE OR DELETE ... FOR EACH ROW` trigger raises an exception. A `BEFORE TRUNCATE ... FOR EACH STATEMENT` trigger does the same for TRUNCATE ("triggers may be defined to fire for `TRUNCATE`, though only `FOR EACH STATEMENT`").

  ```sql
  CREATE FUNCTION ledger.reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    RAISE EXCEPTION '% on %.% is not allowed (append-only ledger)', TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
      USING ERRCODE = 'insufficient_privilege';
  END $$;
  CREATE TRIGGER entry_line_no_update_delete BEFORE UPDATE OR DELETE ON ledger.entry_line
    FOR EACH ROW EXECUTE FUNCTION ledger.reject_mutation();
  CREATE TRIGGER entry_line_no_truncate BEFORE TRUNCATE ON ledger.entry_line
    FOR EACH STATEMENT EXECUTE FUNCTION ledger.reject_mutation();
  ```
  The owner or a superuser can still drop or disable triggers. Triggers protect against accidents, not
  against a malicious DBA.
- Rules (rules-update.html): `CREATE RULE ... DO INSTEAD NOTHING` turns the statement into a **silent no-op**, not an error. The docs list caveats (volatile functions, `WITH` clauses unsupported) and recommend: "In many cases, tasks that could be performed by rules on `INSERT`/`UPDATE`/`DELETE` are better done with triggers." **Do not use rules.**
- Corrections are posted as new reversing entries that reference the original. Nothing is edited in place.

## 8. Recommended enforcement stack (summary)

1. Amounts are `numeric(39,0)` integer minor units with `CHECK (amount <> 0)`. Asset decimals live in the asset table.
2. Balanced entries use a `DEFERRABLE INITIALLY DEFERRED` constraint trigger (AFTER INSERT, FOR EACH ROW) that checks `sum(amount) = 0` grouped by asset for the entry. The library also validates before writing.
3. Append-only is enforced by the app role lacking UPDATE/DELETE/TRUNCATE (app role ≠ owner), plus BEFORE UPDATE/DELETE row triggers and a BEFORE TRUNCATE statement trigger that raise exceptions. No rules.
4. Idempotency comes from NOT DEFERRABLE unique natural keys plus `ON CONFLICT DO NOTHING`.
5. Concurrency: one transaction per ingestion unit, `pg_try_advisory_xact_lock` per (network, source cursor), and retry on 40001/40P01.

## Sources

- https://www.postgresql.org/support/versioning/ — retrieved 2026-11-16
- https://www.postgresql.org/docs/current/datatype-numeric.html — retrieved 2026-11-16
- https://www.postgresql.org/docs/current/transaction-iso.html — retrieved 2026-11-16
- https://www.postgresql.org/docs/current/errcodes-appendix.html — retrieved 2026-11-16
- https://www.postgresql.org/docs/current/ddl-constraints.html — retrieved 2026-11-16
- https://www.postgresql.org/docs/current/sql-createtable.html — retrieved 2026-11-16
- https://www.postgresql.org/docs/current/sql-set-constraints.html — retrieved 2026-11-16
- https://www.postgresql.org/docs/current/sql-createtrigger.html — retrieved 2026-11-16
- https://www.postgresql.org/docs/current/sql-insert.html — retrieved 2026-11-16
- https://www.postgresql.org/docs/current/explicit-locking.html — retrieved 2026-11-16
- https://www.postgresql.org/docs/current/functions-admin.html (9.28.10 Advisory Lock Functions) — retrieved 2026-11-16
- https://www.postgresql.org/docs/current/ddl-priv.html — retrieved 2026-11-16
- https://www.postgresql.org/docs/current/sql-revoke.html — retrieved 2026-11-16
- https://www.postgresql.org/docs/current/rules-update.html — retrieved 2026-11-16

## Open questions

1. Minimum supported PostgreSQL version for StellarBooks. 14 reached EOL on 2026-11-12. PG 19 is at RC2. Options are 15+ or 16+. Nothing above appears to need >14 except `NULLS NOT DISTINCT` (added in 15; version not verified from the docs this pass) and `NOT ENFORCED` (18, not needed).
2. Return type of `sum(bigint)` and `sum(numeric)` (believed to be `numeric`) was not re-verified on the aggregate-functions page.
3. Whether `NaN` can be stored in a constrained `numeric(39,0)` column. The docs only restrict Infinity. Add an explicit CHECK anyway.
4. `btree_gist` is needed for EXCLUDE constraints mixing scalar equality with range overlap (e.g. accounting periods). This was not confirmed from the docs fetched.
5. Performance of row-level deferred constraint triggers on large batches (e.g. a full ledger). Benchmark per-line versus per-header triggers.
6. Whether managed Postgres providers in scope allow creating separate owner and app roles, and whether they run PgBouncer in transaction mode. That setup breaks session-level advisory locks and `SET` state.
7. Decimal handling for Soroban tokens with non-7 decimals. Where is `decimals` sourced from (token contract metadata)? This affects reporting, not storage.
