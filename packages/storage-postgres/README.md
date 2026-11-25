# @stellarbooks/storage-postgres

PostgreSQL storage for the append-only StellarBooks journal: migrations, a repository with
idempotent posting, and an in-memory repository with the same interface for tests and offline use.
Requires PostgreSQL 15 or later; CI tests 15 and 18.

## Usage

```ts
import { Pool } from 'pg';
import { createPostgresRepository, runMigrations } from '@stellarbooks/storage-postgres';

const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
await runMigrations(pool);

// There is no book-registration API yet (Q-036); create the book row directly.
const book = await pool.query<{ id: number }>(
  "INSERT INTO book (name, network) VALUES ('Acme payroll', 'testnet') RETURNING id",
);
const bookId = book.rows[0]!.id;

const repo = createPostgresRepository(pool);
const { posted, duplicates } = await repo.postEntries(bookId, entries, lastCompleteLedger);
const journal = await repo.getEntries(bookId, { fromDate: '2026-11-01T00:00:00Z' });
```

`createInMemoryRepository()` returns the same interface without a database. One difference
today: the PostgreSQL `getEntries` applies only the `fromDate` and `toDate` filters and ignores
`fromLedger`, `toLedger`, `accountCode` and `wallet`, which the in-memory version applies
(issue 44).

## Guarantees

The database enforces these rules itself ([ADR-0006](../../docs/adr/0006-database-integrity.md)),
so they hold even for writes that bypass the repository:

- **Balanced entries:** a deferred constraint trigger rejects any entry whose lines do not sum to
  zero per asset, and every entry needs at least two lines.
- **Append-only:** updates and deletes of entries, lines and events are rejected. Lines must be
  inserted in the same transaction as their entry; older entries are sealed.
- **Unique posting keys:** a posting key can appear only once in the whole database. Keys do not
  include a book, so two books that track the same wallet with the same rules cannot both post the
  same chain fact yet (issue 43).

The repository adds:

- **Idempotent posting:** an entry whose posting key already exists in the same book is skipped
  and counted in `duplicates`. Content is not compared (issue 45). Concurrent posters to one book
  are serialized by a book lock.
- **Period cutoffs** (below), checked when posting through the repository.

## Checkpoints

Pass the last fully processed ledger as the optional third argument to `postEntries`. Entries and
the checkpoint commit together, and an older checkpoint never replaces a newer one. The caller must
make sure the ledger is complete before checkpointing it. `getCheckpoint` and `setCheckpoint` read
and advance it directly.

## Period close

`closePeriod(bookId, name, cutoff)` blocks new entries dated on or before an inclusive UTC cutoff.
Posting and closing take the same book lock. Repeating the same name and cutoff is safe, and entries
that were already posted can still be replayed. Closing journal entries (for example moving income
and expenses to retained earnings) are not implemented yet (issue 37).

## Integration test

Set `STELLARBOOKS_TEST_DATABASE_URL` to a disposable database and run `pnpm run test`. The test
creates an isolated schema, checks concurrent replay, rollback, cutoffs, sealing, and
source-position and reversal-link round-trips, and drops the schema afterwards. For example, with Docker:

```sh
docker run --rm -d --name stellarbooks-pg -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:18
STELLARBOOKS_TEST_DATABASE_URL=postgresql://postgres:dev@127.0.0.1:5432/postgres pnpm run test
docker stop stellarbooks-pg
```

Licensed under MIT. See [LICENSE](../../LICENSE).
