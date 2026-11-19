/**
 * Database migration runner for PostgreSQL.
 *
 * @module
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Runs the initial SQL migrations against a Postgres pool.
 *
 * @param pool - A connected pg Pool instance.
 */
export async function runMigrations(pool: Pool): Promise<void> {
  const sqlPath = join(__dirname, '..', 'src', 'migrations', '001-initial-schema.sql');
  const sql = readFileSync(sqlPath, 'utf8');
  await pool.query(sql);
}
