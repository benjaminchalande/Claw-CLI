/**
 * Bridge initialization: database, memory, history, system prompt.
 * Extracted from Bridge constructor to keep it focused on orchestration.
 */
import { mkdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { openDatabase, migrate, DEFAULT_DB_PATH } from '../memory/db.js';
import { MemoryStore } from '../memory/store.js';
import { PlanningStore } from '../planning/store.js';
import { ConversationHistory } from './history.js';
import { buildSystemPromptFile } from './prompt-builder.js';
import { SchedulerStore } from '../scheduler/store.js';
import type Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface BridgeServices {
  db: Database.Database;
  memory: MemoryStore;
  planning: PlanningStore;
  history: ConversationHistory;
  systemPromptFile: string;
  scheduler: SchedulerStore;
}

export function initBridgeServices(): BridgeServices {
  // Ensure data directory
  mkdirSync(dirname(DEFAULT_DB_PATH), { recursive: true });

  // Open shared database
  const db = openDatabase();
  migrate(db);

  // Additional migrations (idempotentes — CREATE TABLE IF NOT EXISTS)
  for (const file of ['003_history.sql', '004_epics_tasks.sql', '005_scheduler.sql']) {
    const sql = readFileSync(join(__dirname, '..', '..', 'migrations', file), 'utf-8');
    db.exec(sql);
  }

  const memory = new MemoryStore(db);
  const planning = new PlanningStore(db);
  const history = new ConversationHistory(10, 1, db);
  const systemPromptFile = buildSystemPromptFile();

  // Scheduler utilise la même DB partagée (memory.db)
  const scheduler = new SchedulerStore(db);

  console.log(`[init] DB: ${DEFAULT_DB_PATH}`);
  console.log(`[init] System prompt: ${systemPromptFile}`);

  return { db, memory, planning, history, systemPromptFile, scheduler };
}
