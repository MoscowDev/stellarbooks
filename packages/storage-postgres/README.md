# @stellarbooks/storage-postgres

PostgreSQL migrations and repositories for the append-only StellarBooks journal.

The package exposes migration, PostgreSQL and in-memory repository APIs. Track the
remaining integrity and verification work in [OPEN-QUESTIONS.md](../../docs/OPEN-QUESTIONS.md).

Licensed under MIT. See [LICENSE](../../LICENSE).

## Posting with a checkpoint

Pass the completed ledger sequence as the optional third argument to
`repository.postEntries(bookId, entries, checkpoint)`. Entries and the checkpoint
commit together. The caller establishes that the ledger is complete before supplying
the checkpoint. Older checkpoint values are ignored on replay.

Set `STELLARBOOKS_TEST_DATABASE_URL` to a disposable PostgreSQL test database and run
`pnpm run test` to exercise concurrent posting and rollback. The test creates and
removes an isolated schema.

`closePeriod(bookId, name, cutoff)` applies an inclusive UTC cutoff to new entries
posted through the repository. Posting and closing take the same book lock in PostgreSQL.
Repeating the same name and cutoff is idempotent, and previously posted entries can
still be replayed. The cutoff is cumulative. Closing journal entries such as retained
earnings transfers are a separate workflow.

Journal lines must be inserted in the same database transaction as their header.
The migration seals older entries as well. Source positions and same-book reversal
links are returned with the journal. Post the original entry before its reversal.
