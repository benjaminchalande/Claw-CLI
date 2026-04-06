#!/usr/bin/env node
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { openDatabase, migrate, DEFAULT_DB_PATH } from './db.js';
import { MemoryStore, type Zone } from './store.js';

function usage(): never {
  console.log(`Usage: memory <command> [options]

Commands:
  write   --zone <zone> --name <name> --content <content> [--theme <theme>] [--importance 1-3] [--source <src>]
  append  --zone <zone> --name <name> --content <content> [--theme <theme>] [--importance 1-3]
  read    --zone <zone> --name <name> [--theme <theme>]
  delete  --zone <zone> --name <name> [--theme <theme>]
  list    [--zone <zone>]
  themes  --zone <zone>
  search  <query> [--zone <zone>] [--limit <n>]
  count   [--zone <zone>]
  dump    [--zone <zone>] — export all entries as JSON

Zones: internal, external, user`);
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
    console.error(`Missing required flag: --${key}`);
    process.exit(1);
  }
  return val;
}

function validateZone(z: string): Zone {
  if (!['internal', 'external', 'user'].includes(z)) {
    console.error(`Invalid zone: ${z}. Must be internal, external, or user.`);
    process.exit(1);
  }
  return z as Zone;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) usage();

  const { command, positional, flags } = parseArgs(args);

  // Ensure data directory exists
  mkdirSync(dirname(DEFAULT_DB_PATH), { recursive: true });

  const db = openDatabase();
  migrate(db);
  const store = new MemoryStore(db);

  switch (command) {
    case 'write': {
      const zone = validateZone(requireFlag(flags, 'zone'));
      const name = requireFlag(flags, 'name');
      const content = requireFlag(flags, 'content');
      const entry = store.write({
        zone, name, content,
        theme: flags.theme,
        user_id: flags['user-id'],
        importance: flags.importance ? parseInt(flags.importance) : undefined,
        source: flags.source as any,
      });
      console.log(`Written: ${entry.zone}/${entry.theme || '_'}/${entry.name} (id=${entry.id})`);
      break;
    }

    case 'append': {
      const zone = validateZone(requireFlag(flags, 'zone'));
      const name = requireFlag(flags, 'name');
      const content = requireFlag(flags, 'content');
      const entry = store.append({
        zone, name, content,
        theme: flags.theme,
        user_id: flags['user-id'],
        importance: flags.importance ? parseInt(flags.importance) : undefined,
      });
      console.log(`Appended to: ${entry.zone}/${entry.theme || '_'}/${entry.name} (id=${entry.id})`);
      break;
    }

    case 'read': {
      const zone = validateZone(requireFlag(flags, 'zone'));
      const name = requireFlag(flags, 'name');
      const entry = store.read(zone, name, flags['user-id'] ?? '', flags.theme ?? '');
      if (!entry) {
        console.error('Not found');
        process.exit(1);
      }
      console.log(entry.content);
      break;
    }

    case 'delete': {
      const zone = validateZone(requireFlag(flags, 'zone'));
      const name = requireFlag(flags, 'name');
      const ok = store.delete(zone, name, flags['user-id'] ?? '', flags.theme ?? '');
      console.log(ok ? 'Deleted' : 'Not found');
      break;
    }

    case 'list': {
      const zone = flags.zone ? validateZone(flags.zone) : undefined;
      const entries = store.listAll(zone);
      if (entries.length === 0) {
        console.log('No entries');
        break;
      }
      for (const e of entries) {
        const path = [e.zone, e.theme || '_', e.name].join('/');
        const imp = '!'.repeat(e.importance);
        console.log(`  ${imp} ${path} (${e.updated_at})`);
      }
      console.log(`\n${entries.length} entries`);
      break;
    }

    case 'themes': {
      const zone = validateZone(requireFlag(flags, 'zone'));
      const themes = store.listThemes(zone, flags['user-id'] ?? '');
      if (themes.length === 0) {
        console.log('No themes');
      } else {
        themes.forEach(t => console.log(`  ${t}`));
      }
      break;
    }

    case 'search': {
      const query = positional[0];
      if (!query) {
        console.error('Usage: memory search <query>');
        process.exit(1);
      }
      const zone = flags.zone ? validateZone(flags.zone) : undefined;
      const limit = flags.limit ? parseInt(flags.limit) : undefined;
      const results = store.search(query, { zone, limit });
      if (results.length === 0) {
        console.log('No results');
        break;
      }
      for (const r of results) {
        const path = [r.entry.zone, r.entry.theme || '_', r.entry.name].join('/');
        console.log(`  [${r.score.toFixed(2)}] ${path}`);
        // Show first 200 chars of content
        const preview = r.entry.content.slice(0, 200).replace(/\n/g, ' ');
        console.log(`    ${preview}${r.entry.content.length > 200 ? '...' : ''}`);
      }
      break;
    }

    case 'count': {
      const zone = flags.zone ? validateZone(flags.zone) : undefined;
      console.log(store.count(zone));
      break;
    }

    case 'dump': {
      const zone = flags.zone ? validateZone(flags.zone) : undefined;
      const entries = store.listAll(zone);
      console.log(JSON.stringify(entries, null, 2));
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      usage();
  }

  db.close();
}

main();
