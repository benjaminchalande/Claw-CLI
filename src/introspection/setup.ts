/**
 * Enregistre les jobs d'introspection par défaut dans le scheduler.
 * Usage: npx tsx src/introspection/setup.ts
 */
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { openDatabase, migrate, DEFAULT_DB_PATH } from '../scheduler/db.js';
import { SchedulerStore } from '../scheduler/store.js';
import {
  MEMORIZE_PROMPT,
  CONSOLIDATE_PROMPT,
  REFLECT_PROMPT,
  STATUS_REPORT_PROMPT,
  ROADMAP_SYNC_PROMPT,
} from './prompts.js';

function main() {
  mkdirSync(dirname(DEFAULT_DB_PATH), { recursive: true });
  const db = openDatabase();
  migrate(db);
  const store = new SchedulerStore(db);

  const jobs = [
    {
      name: 'introspection-memorize',
      description: 'T1 — Mémorisation rapide des faits récents',
      schedule_type: 'interval' as const,
      schedule_value: '6h',
      prompt: MEMORIZE_PROMPT,
    },
    {
      name: 'introspection-consolidate',
      description: 'T2 — Consolidation mémoire (doublons, résumés)',
      schedule_type: 'cron' as const,
      schedule_value: '0 2 * * *', // 2h du matin tous les jours
      prompt: CONSOLIDATE_PROMPT,
    },
    {
      name: 'introspection-reflect',
      description: 'T3 — Bilan hebdomadaire et mise à jour roadmap',
      schedule_type: 'cron' as const,
      schedule_value: '0 9 * * 1', // Lundi 9h
      prompt: REFLECT_PROMPT,
    },
    {
      name: 'daily-status',
      description: 'Rapport d\'état quotidien',
      schedule_type: 'cron' as const,
      schedule_value: '0 8 * * *', // 8h tous les jours
      prompt: STATUS_REPORT_PROMPT,
    },
    {
      name: 'roadmap-sync',
      description: 'Synchronisation roadmap vs état réel du code',
      schedule_type: 'cron' as const,
      schedule_value: '0 3 * * *', // 3h du matin tous les jours
      prompt: ROADMAP_SYNC_PROMPT,
    },
  ];

  for (const job of jobs) {
    const existing = store.getByName(job.name);
    if (existing) {
      console.log(`  [skip] ${job.name} — existe déjà (id=${existing.id})`);
      continue;
    }
    const created = store.create(job);
    console.log(`  [add]  ${job.name} — id=${created.id}, next=${created.next_run_at}`);
  }

  console.log(`\nTotal: ${store.count()} jobs enregistrés`);
  db.close();
}

main();
