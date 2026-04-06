#!/usr/bin/env node
/**
 * CLI pour gérer les epics et tâches.
 * Usage: npx tsx src/planning/cli.ts <command> [options]
 */
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { openDatabase, migrate, DEFAULT_DB_PATH } from './db.js';
import { PlanningStore, type EpicPriority, type EpicStatus, type TaskStatus } from './store.js';

function usage(): never {
  console.log(`Usage: planning <command> [options]

Epic commands:
  epic create  --title <t> [--desc <d>] [--priority P1|P2|P3] [--criteria <c>]
  epic list    [--status <s>] [--all]
  epic get     <id>
  epic update  <id> [--title <t>] [--status <s>] [--priority <p>] [--desc <d>]

Task commands:
  task create  --title <t> [--epic <id>] [--desc <d>]
  task list    [--epic <id>] [--status <s>]
  task get     <id>
  task update  <id> [--title <t>] [--status <s>] [--result <r>]

Other:
  summary      — active epics and pending tasks (for prompt injection)`);
  process.exit(1);
}

function parseArgs(args: string[]): { command: string; sub: string; positional: string[]; flags: Record<string, string> } {
  const command = args[0] ?? '';
  const sub = args[1] ?? '';
  const positional: string[] = [];
  const flags: Record<string, string> = {};

  for (let i = 2; i < args.length; i++) {
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

  return { command, sub, positional, flags };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) usage();

  const { command, sub, positional, flags } = parseArgs(args);

  mkdirSync(dirname(DEFAULT_DB_PATH), { recursive: true });
  const db = openDatabase();
  migrate(db);
  const store = new PlanningStore(db);

  switch (command) {
    case 'epic':
      switch (sub) {
        case 'create': {
          const title = flags.title;
          if (!title) { console.error('--title requis'); process.exit(1); }
          const epic = store.createEpic(title, {
            description: flags.desc,
            priority: flags.priority as EpicPriority,
            success_criteria: flags.criteria,
          });
          console.log(`Epic créée: [${epic.priority}] #${epic.id} ${epic.title}`);
          break;
        }
        case 'list': {
          const epics = store.listEpics({
            status: flags.status as EpicStatus,
            all: flags.all === 'true',
          });
          if (epics.length === 0) { console.log('Aucune epic'); break; }
          for (const e of epics) {
            const tasks = store.listTasks({ epic_id: e.id });
            const done = tasks.filter(t => t.status === 'done').length;
            console.log(`  [${e.priority}] #${e.id} ${e.title} (${e.status}) — ${done}/${tasks.length} tâches`);
          }
          break;
        }
        case 'get': {
          const id = parseInt(positional[0]);
          if (!id) { console.error('ID requis'); process.exit(1); }
          const epic = store.getEpic(id);
          if (!epic) { console.error('Epic non trouvée'); process.exit(1); }
          console.log(JSON.stringify(epic, null, 2));
          const tasks = store.listTasks({ epic_id: id });
          if (tasks.length > 0) {
            console.log(`\nTâches (${tasks.length}):`);
            for (const t of tasks) {
              const icon = { pending: '○', in_progress: '→', done: '✓', failed: '✗', blocked: '⊘', cancelled: '—' }[t.status];
              console.log(`  ${icon} #${t.id} ${t.title} (${t.status})`);
            }
          }
          break;
        }
        case 'update': {
          const id = parseInt(positional[0]);
          if (!id) { console.error('ID requis'); process.exit(1); }
          const ok = store.updateEpic(id, {
            title: flags.title,
            description: flags.desc,
            status: flags.status as EpicStatus,
            priority: flags.priority as EpicPriority,
            success_criteria: flags.criteria,
          });
          console.log(ok ? 'Epic mise à jour' : 'Epic non trouvée');
          break;
        }
        default: usage();
      }
      break;

    case 'task':
      switch (sub) {
        case 'create': {
          const title = flags.title;
          if (!title) { console.error('--title requis'); process.exit(1); }
          const task = store.createTask(title, {
            epic_id: flags.epic ? parseInt(flags.epic) : undefined,
            description: flags.desc,
          });
          console.log(`Tâche créée: #${task.id} ${task.title}${task.epic_id ? ` (epic #${task.epic_id})` : ''}`);
          break;
        }
        case 'list': {
          const tasks = store.listTasks({
            epic_id: flags.epic ? parseInt(flags.epic) : undefined,
            status: flags.status as TaskStatus,
          });
          if (tasks.length === 0) { console.log('Aucune tâche'); break; }
          for (const t of tasks) {
            const icon = { pending: '○', in_progress: '→', done: '✓', failed: '✗', blocked: '⊘', cancelled: '—' }[t.status];
            console.log(`  ${icon} #${t.id} ${t.title} (${t.status})${t.epic_id ? ` [epic #${t.epic_id}]` : ''}`);
          }
          break;
        }
        case 'get': {
          const id = parseInt(positional[0]);
          if (!id) { console.error('ID requis'); process.exit(1); }
          const task = store.getTask(id);
          if (!task) { console.error('Tâche non trouvée'); process.exit(1); }
          console.log(JSON.stringify(task, null, 2));
          break;
        }
        case 'update': {
          const id = parseInt(positional[0]);
          if (!id) { console.error('ID requis'); process.exit(1); }
          const ok = store.updateTask(id, {
            title: flags.title,
            status: flags.status as TaskStatus,
            result: flags.result,
            epic_id: flags.epic ? parseInt(flags.epic) : undefined,
          });
          console.log(ok ? 'Tâche mise à jour' : 'Tâche non trouvée');
          break;
        }
        default: usage();
      }
      break;

    case 'summary':
      console.log(store.activeSummary() || 'Aucun travail en cours');
      break;

    default: usage();
  }

  db.close();
}

main();
