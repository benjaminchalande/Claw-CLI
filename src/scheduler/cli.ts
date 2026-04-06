#!/usr/bin/env node
/**
 * CLI pour gérer les tâches planifiées.
 * Usage: npx tsx src/scheduler/cli.ts <command> [options]
 */
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { openDatabase, migrate, DEFAULT_DB_PATH } from './db.js';
import { SchedulerStore, type ScheduledJob } from './store.js';
import { type ScheduleType, validateSchedule } from './cron.js';
import { runDueJobs } from './runner.js';

function usage(): never {
  console.log(`Usage: scheduler <command> [options]

Commands:
  add      --name <n> --type <cron|interval|once> --value <v> --prompt <p> [--desc <d>] [--target <t>]
  list     [--status <active|paused|completed|failed>]
  show     <name>
  pause    <name>
  resume   <name>
  remove   <name>
  history  <name> [--limit <n>]
  run      — exécute les jobs dus maintenant
  run-one  <name> — force l'exécution d'un job
  count    [--status <s>]

Schedule types:
  cron     — expression cron 5 champs (ex: "0 3 * * *" = tous les jours à 3h)
  interval — durée (ex: "30m", "1h", "6h", "1d")
  once     — date ISO 8601 (ex: "2026-04-10T14:00:00Z")`);
  process.exit(1);
}

function parseArgs(args: string[]): { command: string; positional: string[]; flags: Record<string, string> } {
  const command = args[0];
  if (!command) usage();

  const positional: string[] = [];
  const flags: Record<string, string> = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const val = args[i + 1];
      if (!val || val.startsWith('--')) {
        flags[key] = 'true';
      } else {
        flags[key] = val;
        i++;
      }
    } else {
      positional.push(args[i]);
    }
  }

  return { command, positional, flags };
}

function requireFlag(flags: Record<string, string>, key: string): string {
  const val = flags[key];
  if (!val) {
    console.error(`Paramètre requis: --${key}`);
    process.exit(1);
  }
  return val;
}

function formatJob(job: ScheduledJob): string {
  const status = { active: '●', paused: '◌', completed: '✓', failed: '✗' }[job.status];
  const schedule = `${job.schedule_type}:${job.schedule_value}`;
  const next = job.next_run_at ? ` → ${job.next_run_at}` : '';
  return `${status} [${job.id}] ${job.name} (${schedule})${next}`;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) usage();

  const { command, positional, flags } = parseArgs(args);

  mkdirSync(dirname(DEFAULT_DB_PATH), { recursive: true });

  const db = openDatabase();
  migrate(db);
  const store = new SchedulerStore(db);

  switch (command) {
    case 'add': {
      const name = requireFlag(flags, 'name');
      const type = requireFlag(flags, 'type') as ScheduleType;
      const value = requireFlag(flags, 'value');
      const prompt = requireFlag(flags, 'prompt');

      if (!['cron', 'interval', 'once'].includes(type)) {
        console.error(`Type invalide: ${type}. Doit être cron, interval ou once.`);
        process.exit(1);
      }

      const error = validateSchedule(type, value);
      if (error) {
        console.error(`Schedule invalide: ${error}`);
        process.exit(1);
      }

      const job = store.create({
        name,
        schedule_type: type,
        schedule_value: value,
        prompt,
        description: flags.desc ?? '',
        delivery_target: flags.target ?? '',
        delivery_mode: flags.target ? 'announce' : 'silent',
        max_failures: flags['max-failures'] ? parseInt(flags['max-failures']) : undefined,
      });
      console.log(`Job créé: ${formatJob(job)}`);
      break;
    }

    case 'list': {
      const status = flags.status as any;
      const jobs = store.list(status);
      if (jobs.length === 0) {
        console.log('Aucun job');
        break;
      }
      for (const job of jobs) {
        console.log(`  ${formatJob(job)}`);
        if (job.description) console.log(`    ${job.description}`);
      }
      console.log(`\n${jobs.length} job(s)`);
      break;
    }

    case 'show': {
      const name = positional[0];
      if (!name) { console.error('Usage: scheduler show <name>'); process.exit(1); }
      const job = store.getByName(name);
      if (!job) { console.error(`Job "${name}" non trouvé`); process.exit(1); }
      console.log(`Nom:          ${job.name}`);
      console.log(`Description:  ${job.description || '(aucune)'}`);
      console.log(`Schedule:     ${job.schedule_type}:${job.schedule_value}`);
      console.log(`Status:       ${job.status}`);
      console.log(`Prompt:       ${job.prompt.slice(0, 200)}${job.prompt.length > 200 ? '...' : ''}`);
      console.log(`Prochain run: ${job.next_run_at || '(aucun)'}`);
      console.log(`Dernier run:  ${job.last_run_at || '(jamais)'}`);
      console.log(`Échecs:       ${job.failure_count}/${job.max_failures}`);
      if (job.delivery_target) {
        console.log(`Notification: ${job.delivery_mode} → ${job.delivery_target}`);
      }
      if (job.last_result) {
        console.log(`Dernier résultat:\n${job.last_result.slice(0, 500)}`);
      }
      break;
    }

    case 'pause': {
      const name = positional[0];
      if (!name) { console.error('Usage: scheduler pause <name>'); process.exit(1); }
      const ok = store.pause(name);
      console.log(ok ? `Job "${name}" mis en pause` : `Job "${name}" non trouvé ou déjà inactif`);
      break;
    }

    case 'resume': {
      const name = positional[0];
      if (!name) { console.error('Usage: scheduler resume <name>'); process.exit(1); }
      const ok = store.resume(name);
      console.log(ok ? `Job "${name}" repris` : `Job "${name}" non trouvé ou pas en pause`);
      break;
    }

    case 'remove': {
      const name = positional[0];
      if (!name) { console.error('Usage: scheduler remove <name>'); process.exit(1); }
      const ok = store.delete(name);
      console.log(ok ? `Job "${name}" supprimé` : `Job "${name}" non trouvé`);
      break;
    }

    case 'history': {
      const name = positional[0];
      if (!name) { console.error('Usage: scheduler history <name>'); process.exit(1); }
      const job = store.getByName(name);
      if (!job) { console.error(`Job "${name}" non trouvé`); process.exit(1); }
      const limit = flags.limit ? parseInt(flags.limit) : 10;
      const execs = store.executions(job.id, limit);
      if (execs.length === 0) {
        console.log('Aucune exécution');
        break;
      }
      for (const e of execs) {
        const duration = e.duration_ms ? `${e.duration_ms}ms` : '?';
        const status = e.exit_code === 0 ? '✓' : `✗(${e.exit_code})`;
        console.log(`  ${status} ${e.started_at} (${duration})`);
        if (e.stdout) {
          const preview = e.stdout.slice(0, 200).replace(/\n/g, ' ');
          console.log(`    ${preview}${e.stdout.length > 200 ? '...' : ''}`);
        }
      }
      break;
    }

    case 'run': {
      const count = await runDueJobs(store);
      console.log(`${count} job(s) exécuté(s)`);
      break;
    }

    case 'run-one': {
      const name = positional[0];
      if (!name) { console.error('Usage: scheduler run-one <name>'); process.exit(1); }
      const job = store.getByName(name);
      if (!job) { console.error(`Job "${name}" non trouvé`); process.exit(1); }

      // Force next_run_at to now so it becomes due
      const now = new Date().toISOString();
      store['db'].prepare("UPDATE scheduled_jobs SET next_run_at = ?, updated_at = datetime('now') WHERE id = ?")
        .run(now, job.id);

      const count = await runDueJobs(store);
      console.log(count > 0 ? `Job "${name}" exécuté` : `Échec de l'exécution`);
      break;
    }

    case 'count': {
      const status = flags.status as any;
      console.log(store.count(status));
      break;
    }

    default:
      console.error(`Commande inconnue: ${command}`);
      usage();
  }

  db.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
