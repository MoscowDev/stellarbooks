import { randomUUID } from 'node:crypto';
import { amount, NATIVE_ASSET, reverseEntry, type JournalEntry } from '@stellarbooks/core';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { createPostgresRepository, runMigrations } from '../src/index.js';

const connectionString = process.env['STELLARBOOKS_TEST_DATABASE_URL'] ?? '';

describe.skipIf(connectionString === '')('PostgreSQL posting checkpoints', () => {
  it('commits concurrent replays once and rolls back journal and checkpoint on failure', async () => {
    const schema = 'stellarbooks_test_' + randomUUID().replaceAll('-', '');
    const admin = new Pool({ connectionString });
    const pool = new Pool({ connectionString, options: '-c search_path=' + schema });
    try {
      await admin.query('CREATE SCHEMA ' + schema);
      await runMigrations(pool);
      const book = await pool.query<{ id: number }>(
        "INSERT INTO book (name, network) VALUES ('Integration test', 'offline') RETURNING id",
      );
      const bookId = book.rows[0]?.id;
      if (bookId === undefined) throw new Error('Missing integration test book');
      const repo = createPostgresRepository(pool);
      const entry: JournalEntry = {
        postingKey: 'manual/test',
        sourceKey: 'manual/test',
        date: '2026-11-18T00:00:00Z',
        description: 'Integration test opening balance',
        source: {
          network: 'offline',
          ledger: 100,
          txIndex: 0,
          txHash: 'a'.repeat(64),
          stage: 'operation',
          opIndex: 0,
          eventIndex: 0,
        },
        lines: [
          { account: '1000', amount: amount(NATIVE_ASSET, 1n) },
          { account: '3000', amount: amount(NATIVE_ASSET, -1n) },
        ],
      };
      const results = await Promise.all([
        repo.postEntries(bookId, [entry], 100),
        repo.postEntries(bookId, [entry], 100),
      ]);
      expect(results.map(({ posted }) => posted).sort()).toEqual([0, 1]);
      const invalid = {
        ...entry,
        postingKey: 'manual/unbalanced',
        lines: [...entry.lines, { account: '1000', amount: amount(NATIVE_ASSET, 1n) }],
      };
      await expect(repo.postEntries(bookId, [invalid], 101)).rejects.toThrow('does not balance');
      expect(await repo.getCheckpoint(bookId)).toBe(100);
      expect((await repo.getEntries(bookId)).map(({ postingKey }) => postingKey)).toEqual([
        entry.postingKey,
      ]);

      await Promise.all([
        repo.closePeriod(bookId, '2026-11', entry.date),
        repo.closePeriod(bookId, '2026-11', entry.date),
      ]);
      const periods = await pool.query("SELECT id FROM period WHERE name = '2026-11'");
      expect(periods.rowCount).toBe(1);
      await expect(
        repo.postEntries(bookId, [{ ...entry, postingKey: 'manual/late' }], 102),
      ).rejects.toThrow('Cannot post into closed period');
      expect(await repo.getCheckpoint(bookId)).toBe(100);
      expect(await repo.postEntries(bookId, [entry])).toEqual({ posted: 0, duplicates: 1 });
      await expect(
        pool.query(
          `INSERT INTO journal_line (entry_id, account_code, asset_id, units)
         SELECT id, '1000', 'native', 1 FROM journal_entry WHERE posting_key = $1`,
          [entry.postingKey],
        ),
      ).rejects.toThrow('sealed or missing');
      const reversal = reverseEntry(entry, {
        date: '2026-11-19T00:00:00Z',
        reason: 'Test correction',
      });
      await repo.postEntries(bookId, [reversal]);
      const journal = await repo.getEntries(bookId);
      expect(journal[0]?.source).toEqual(entry.source);
      expect(journal[1]?.reverses).toBe(entry.postingKey);
    } finally {
      try {
        await pool.end();
        await admin.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE');
      } finally {
        await admin.end();
      }
    }
  });
});
