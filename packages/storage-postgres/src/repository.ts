/**
 * Repository interface and implementations for the append-only StellarBooks journal.
 *
 * @module
 */
import {
  amount,
  assetId,
  isUtcTimestamp,
  parseAssetId,
  type AssetId,
  type JournalEntry,
  type JournalLine,
  type SourcePosition,
} from '@stellarbooks/core';
import type { Pool, PoolClient } from 'pg';

async function advanceCheckpoint(
  db: Pool | PoolClient,
  bookId: number,
  ledger: number,
): Promise<void> {
  await db.query(
    `INSERT INTO source_checkpoint (book_id, last_ledger) VALUES ($1, $2)
     ON CONFLICT (book_id) DO UPDATE SET last_ledger = EXCLUDED.last_ledger, updated_at = now()
     WHERE source_checkpoint.last_ledger < EXCLUDED.last_ledger`,
    [bookId, ledger],
  );
}

function checkLedger(ledger: number): void {
  if (!Number.isInteger(ledger) || ledger < 1 || ledger > 2147483647) {
    throw new RangeError('Expected a positive PostgreSQL integer ledger sequence');
  }
}

interface JournalRow {
  source_position: SourcePosition | null;
  reverses: string | null;
  posting_key: string;
  source_key: string;
  entry_date: Date;
  description: string;
  rule_id: string | null;
  rule_set_version: string | null;
  meta: Readonly<Record<string, string>> | null;
  account_code: string;
  asset_id: string;
  units: string;
  wallet: string | null;
  counterparty: string | null;
  note: string | null;
}

export interface PostResult {
  /** Count of newly posted entries. */
  readonly posted: number;
  /** Count of duplicate entries that were skipped idempotently. */
  readonly duplicates: number;
}

export interface GetEntriesOptions {
  /** Start of accounting date range (inclusive, ISO 8601). */
  readonly fromDate?: string;
  /** End of accounting date range (inclusive, ISO 8601). */
  readonly toDate?: string;
  /** Start ledger sequence number (inclusive). */
  readonly fromLedger?: number;
  /** End ledger sequence number (inclusive). */
  readonly toLedger?: number;
  /** Filter by account code. */
  readonly accountCode?: string;
  /** Filter by wallet sub-ledger address. */
  readonly wallet?: string;
}

export interface JournalRepository {
  /**
   * Posts journal entries idempotently. If an entry with the same posting key
   * already exists in the book, it is silently ignored. A supplied checkpoint
   * advances atomically with the batch. The caller must establish ledger completeness.
   */
  postEntries(
    bookId: number,
    entries: readonly JournalEntry[],
    checkpoint?: number,
  ): Promise<PostResult>;

  /**
   * Retrieves journal entries matching the given criteria.
   */
  getEntries(bookId: number, opts?: GetEntriesOptions): Promise<JournalEntry[]>;

  /**
   * Returns the last processed ledger sequence for the book, or null if uninitialized.
   */
  getCheckpoint(bookId: number): Promise<number | null>;

  /**
   * Advances the checkpoint for the book. Lower or equal values are ignored.
   */
  setCheckpoint(bookId: number, ledger: number): Promise<void>;

  /**
   * Ensures an asset exists in the asset registry.
   */
  ensureAsset(asset: AssetId, scale?: number, label?: string): Promise<void>;

  /**
   * Closes posting through an inclusive UTC cutoff. Repeating the same name and cutoff is safe.
   */
  closePeriod(bookId: number, periodName: string, endDate: string): Promise<void>;
}

/**
 * Creates an in-memory JournalRepository for testing and lightweight offline usage.
 */
export function createInMemoryRepository(): JournalRepository {
  const entriesByBook = new Map<number, JournalEntry[]>();
  const postedKeysByBook = new Map<number, Set<string>>();
  const checkpoints = new Map<number, number>();
  const assets = new Set<string>();
  const closedPeriods = new Map<number, { name: string; endDate: string }[]>();

  /* eslint-disable @typescript-eslint/require-await -- The in-memory repository keeps the asynchronous contract and rejects thrown errors as promises. */
  return {
    async postEntries(
      bookId: number,
      entries: readonly JournalEntry[],
      checkpoint?: number,
    ): Promise<PostResult> {
      if (checkpoint !== undefined) checkLedger(checkpoint);
      let posted = 0;
      let duplicates = 0;

      const bookEntries = [...(entriesByBook.get(bookId) ?? [])];
      const seenKeys = new Set(postedKeysByBook.get(bookId));

      for (const entry of entries) {
        if (seenKeys.has(entry.postingKey)) {
          duplicates++;
          continue;
        }

        // Check if posted into closed period
        const periods = closedPeriods.get(bookId) ?? [];
        for (const p of periods) {
          if (Date.parse(entry.date) <= Date.parse(p.endDate)) {
            throw new Error(`Cannot post into closed period "${p.name}" (ended ${p.endDate})`);
          }
        }

        seenKeys.add(entry.postingKey);
        bookEntries.push(entry);
        posted++;
      }

      entriesByBook.set(bookId, bookEntries);
      postedKeysByBook.set(bookId, seenKeys);
      if (checkpoint !== undefined && checkpoint > (checkpoints.get(bookId) ?? 0)) {
        checkpoints.set(bookId, checkpoint);
      }
      return { posted, duplicates };
    },

    async getEntries(bookId: number, opts: GetEntriesOptions = {}): Promise<JournalEntry[]> {
      const list = entriesByBook.get(bookId) ?? [];
      const fromMs = opts.fromDate ? Date.parse(opts.fromDate) : undefined;
      const toMs = opts.toDate ? Date.parse(opts.toDate) : undefined;

      return list.filter((e) => {
        const entryMs = Date.parse(e.date);
        if (fromMs !== undefined && entryMs < fromMs) return false;
        if (toMs !== undefined && entryMs > toMs) return false;
        if (opts.fromLedger !== undefined && (!e.source || e.source.ledger < opts.fromLedger))
          return false;
        if (opts.toLedger !== undefined && (!e.source || e.source.ledger > opts.toLedger))
          return false;

        if (opts.accountCode !== undefined) {
          const hasAccount = e.lines.some((l) => l.account === opts.accountCode);
          if (!hasAccount) return false;
        }

        if (opts.wallet !== undefined) {
          const hasWallet = e.lines.some((l) => l.wallet === opts.wallet);
          if (!hasWallet) return false;
        }

        return true;
      });
    },

    async getCheckpoint(bookId: number): Promise<number | null> {
      return checkpoints.get(bookId) ?? null;
    },

    async setCheckpoint(bookId: number, ledger: number): Promise<void> {
      checkLedger(ledger);
      if (ledger > (checkpoints.get(bookId) ?? 0)) checkpoints.set(bookId, ledger);
    },

    async ensureAsset(asset: AssetId): Promise<void> {
      assets.add(asset);
    },

    async closePeriod(bookId: number, periodName: string, endDate: string): Promise<void> {
      checkPeriod(periodName, endDate);
      let periods = closedPeriods.get(bookId);
      if (!periods) {
        periods = [];
        closedPeriods.set(bookId, periods);
      }
      const existing = periods.find(({ name }) => name === periodName);
      if (existing !== undefined) {
        if (Date.parse(existing.endDate) !== Date.parse(endDate)) {
          throw new Error('Period name already has a different close cutoff');
        }
        return;
      }
      periods.push({ name: periodName, endDate });
    },
  };
}

/* eslint-enable @typescript-eslint/require-await */

function checkPeriod(name: string, endDate: string): void {
  if (name.trim() === '' || !isUtcTimestamp(endDate)) {
    throw new RangeError('Expected a period name and a UTC close cutoff');
  }
}

/**
 * Creates a PostgreSQL-backed JournalRepository.
 *
 * @param pool - Connected pg Pool.
 */
export function createPostgresRepository(pool: Pool): JournalRepository {
  return {
    async postEntries(
      bookId: number,
      entries: readonly JournalEntry[],
      checkpoint?: number,
    ): Promise<PostResult> {
      if (checkpoint !== undefined) checkLedger(checkpoint);
      let posted = 0;
      let duplicates = 0;

      const client = await pool.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
        await client.query('SELECT id FROM book WHERE id = $1 FOR UPDATE', [bookId]);

        for (const entry of entries) {
          // Check if already posted
          const existing = await client.query(
            'SELECT id FROM journal_entry WHERE book_id = $1 AND posting_key = $2',
            [bookId, entry.postingKey],
          );

          if (existing.rowCount && existing.rowCount > 0) {
            duplicates++;
            continue;
          }

          const closed = await client.query<{ name: string }>(
            `SELECT name FROM period
             WHERE book_id = $1 AND status = 'closed' AND end_date >= $2
             ORDER BY end_date DESC, id DESC LIMIT 1`,
            [bookId, entry.date],
          );
          const period = closed.rows[0];
          if (period !== undefined)
            throw new Error(`Cannot post into closed period "${period.name}"`);

          // Ensure assets exist
          for (const line of entry.lines) {
            await client.query(
              'INSERT INTO asset (id, scale) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
              [line.amount.asset, 7],
            );
          }

          let reversesId: string | null = null;
          if (entry.reverses !== undefined) {
            const original = await client.query<{ id: string }>(
              'SELECT id FROM journal_entry WHERE book_id = $1 AND posting_key = $2',
              [bookId, entry.reverses],
            );
            reversesId = original.rows[0]?.id ?? null;
            if (reversesId === null) throw new Error('Reversal target is missing from this book');
          }

          // Insert entry header
          const res = await client.query<{ id: string }>(
            `INSERT INTO journal_entry (
              book_id, posting_key, source_key, entry_date, description, rule_id, rule_set_version,
              meta, source_position, reverses_entry_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING id`,
            [
              bookId,
              entry.postingKey,
              entry.sourceKey,
              entry.date,
              entry.description,
              entry.ruleId ?? null,
              entry.ruleSetVersion ?? null,
              entry.meta ? JSON.stringify(entry.meta) : null,
              entry.source === undefined ? null : JSON.stringify(entry.source),
              reversesId,
            ],
          );

          const entryId = res.rows[0]?.id;
          if (entryId === undefined) throw new Error('Journal entry insert did not return an ID');

          // Insert lines
          for (const line of entry.lines) {
            await client.query(
              `INSERT INTO journal_line (
                entry_id, account_code, asset_id, units, wallet, counterparty, note
              ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [
                entryId,
                line.account,
                line.amount.asset,
                line.amount.units.toString(),
                line.wallet ?? null,
                line.counterparty ?? null,
                line.note ?? null,
              ],
            );
          }

          posted++;
        }

        if (checkpoint !== undefined) await advanceCheckpoint(client, bookId, checkpoint);
        await client.query('COMMIT');
        return { posted, duplicates };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },

    async getEntries(bookId: number, opts: GetEntriesOptions = {}): Promise<JournalEntry[]> {
      const conditions: string[] = ['e.book_id = $1'];
      const params: unknown[] = [bookId];

      if (opts.fromDate) {
        params.push(opts.fromDate);
        conditions.push(`e.entry_date >= $${params.length}`);
      }
      if (opts.toDate) {
        params.push(opts.toDate);
        conditions.push(`e.entry_date <= $${params.length}`);
      }

      const sql = `
        SELECT e.id, e.posting_key, e.source_key, e.entry_date, e.description,
               e.rule_id, e.rule_set_version, e.meta, e.source_position, original.posting_key AS reverses,
               l.account_code, l.asset_id, l.units, l.wallet, l.counterparty, l.note
        FROM journal_entry e
        JOIN journal_line l ON l.entry_id = e.id
        LEFT JOIN journal_entry original ON original.id = e.reverses_entry_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY e.entry_date ASC, e.id ASC, l.id ASC
      `;

      const result = await pool.query<JournalRow>(sql, params);
      const entriesMap = new Map<string, { entry: JournalEntry; lines: JournalLine[] }>();

      for (const row of result.rows) {
        let item = entriesMap.get(row.posting_key);
        if (!item) {
          const entry: JournalEntry = {
            postingKey: row.posting_key,
            sourceKey: row.source_key,
            date: new Date(row.entry_date).toISOString(),
            description: row.description,
            lines: [],
            ...(row.rule_id ? { ruleId: row.rule_id } : {}),
            ...(row.rule_set_version ? { ruleSetVersion: row.rule_set_version } : {}),
            ...(row.meta ? { meta: row.meta } : {}),
            ...(row.source_position === null ? {} : { source: row.source_position }),
            ...(row.reverses === null ? {} : { reverses: row.reverses }),
          };
          item = { entry, lines: [] };
          entriesMap.set(row.posting_key, item);
        }

        const l: JournalLine = {
          account: row.account_code,
          amount: amount(assetId(parseAssetId(row.asset_id)), BigInt(row.units)),
          ...(row.wallet ? { wallet: row.wallet } : {}),
          ...(row.counterparty ? { counterparty: row.counterparty } : {}),
          ...(row.note ? { note: row.note } : {}),
        };
        item.lines.push(l);
      }

      return Array.from(entriesMap.values()).map((item) => ({
        ...item.entry,
        lines: item.lines,
      }));
    },

    async getCheckpoint(bookId: number): Promise<number | null> {
      const res = await pool.query<{ last_ledger: number }>(
        'SELECT last_ledger FROM source_checkpoint WHERE book_id = $1',
        [bookId],
      );
      if (res.rowCount === 0 || !res.rows[0]) return null;
      return res.rows[0].last_ledger;
    },

    async setCheckpoint(bookId: number, ledger: number): Promise<void> {
      checkLedger(ledger);
      await advanceCheckpoint(pool, bookId, ledger);
    },

    async ensureAsset(asset: AssetId, scale = 7, label?: string): Promise<void> {
      await pool.query(
        `INSERT INTO asset (id, scale, label)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO NOTHING`,
        [asset, scale, label ?? null],
      );
    },

    async closePeriod(bookId: number, periodName: string, endDate: string): Promise<void> {
      checkPeriod(periodName, endDate);
      const client = await pool.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
        await client.query('SELECT id FROM book WHERE id = $1 FOR UPDATE', [bookId]);
        const existing = await client.query<{ same_cutoff: boolean }>(
          `SELECT end_date = $3::timestamptz AS same_cutoff FROM period
           WHERE book_id = $1 AND name = $2 AND status = 'closed'`,
          [bookId, periodName, endDate],
        );
        if (existing.rows.some(({ same_cutoff }) => !same_cutoff)) {
          throw new Error('Period name already has a different close cutoff');
        }
        if (existing.rows.length === 0) {
          await client.query(
            `INSERT INTO period (book_id, name, start_date, end_date, status, closed_at)
             VALUES ($1, $2, '-infinity'::timestamptz, $3, 'closed', now())`,
            [bookId, periodName, endDate],
          );
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
