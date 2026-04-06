/**
 * DB pour le CLI scheduler — pointe sur memory.db (partagé avec le bridge).
 * P11 : scheduler.db supprimé, tables fusionnées dans memory.db.
 */
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = join(__dirname, '..', '..');

// Même DB que le bridge (memory.db)
export const DEFAULT_DB_PATH = join(PROJECT_ROOT, 'data', 'memory.db');

const MIGRATIONS = [
  '001_memory.sql',
  '003_history.sql',
  '004_epics_tasks.sql',
  '005_scheduler.sql',
];

export function openDatabase(dbPath?: string): Database.Database {
  const path = dbPath ?? DEFAULT_DB_PATH;
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

/** Applique toutes les migrations nécessaires (idempotentes). */
export function migrate(db: Database.Database): void {
  for (const file of MIGRATIONS) {
    const migPath = join(PROJECT_ROOT, 'migrations', file);
    const sql = readFileSync(migPath, 'utf-8');
    db.exec(sql);
  }
}

export { DEFAULT_DB_PATH as SCHEDULER_DB_PATH };
