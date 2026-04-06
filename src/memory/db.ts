import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const DEFAULT_DB_PATH = join(PROJECT_ROOT, 'data', 'memory.db');
const MIGRATION_PATH = join(PROJECT_ROOT, 'migrations', '001_memory.sql');

export function openDatabase(dbPath?: string): Database.Database {
  const path = dbPath ?? DEFAULT_DB_PATH;
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export function migrate(db: Database.Database): void {
  const sql = readFileSync(MIGRATION_PATH, 'utf-8');
  db.exec(sql);
}

export { DEFAULT_DB_PATH, PROJECT_ROOT };
