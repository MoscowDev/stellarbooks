# ADR-0006: Database-enforced balance, append-only and idempotency

- Status: Accepted
- Approved: 2026-11-16 (maintainer approved PLAN.md with defaults)
- Date: 2026-11-16

## Context
Evidence is in docs/research/postgresql.md (PostgreSQL 18 docs).
- A CHECK constraint cannot see other rows, and cannot be deferred.
- A deferred constraint trigger (`DEFERRABLE INITIALLY DEFERRED`) runs at commit.
- Unique constraints used for `ON CONFLICT` must not be deferrable.
- Rules silently rewrite statements, so the docs prefer triggers.

## Decision
- **Balance:**
  - The library validates every entry before writing it.
  - In the database, a deferred constraint trigger on `journal_line` raises if the lines of an entry
    do not sum to zero per asset at commit.
- **Append-only, defended twice:**
  1. The application role is not the table owner. It is granted only SELECT and INSERT on journal
     tables.
  2. BEFORE UPDATE/DELETE row triggers and BEFORE TRUNCATE statement triggers raise an exception.
- **Corrections** are made only with reversing entries that reference the original entry.
- **Idempotency:**
  - Each journal entry has a deterministic `posting_key`, a non-deferrable UNIQUE key built from
    (network passphrase hash, ledger sequence, transaction hash, operation index or -1, event index
    or -1, rule-set version).
  - Inserts use `ON CONFLICT (posting_key) DO NOTHING`. A replay then compares the stored entry hash
    with the recomputed one and fails loudly on mismatch.
- **Concurrency:**
  - Each ingestion unit (a ledger) is written in one transaction.
  - A `pg_try_advisory_xact_lock` is taken per (book, source).
  - On SQLSTATE 40001 or 40P01, the whole unit is retried.
- **Minimum PostgreSQL version:** 15 (14 reached end of life on 2026-11-12). CI tests 15 and 18.

## Consequences
Integrity holds even against buggy callers. Migrations must create two roles (owner, app). Some
managed hosts restrict roles, and this is documented.
