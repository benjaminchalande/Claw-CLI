#!/usr/bin/env node
/**
 * CLI to query conversation history from the shared SQLite database.
 *
 * Usage:
 *   npm run history                      # last 20 messages (all platforms)
 *   npm run history -- --limit 50        # last 50 messages
 *   npm run history -- --platform wa     # WhatsApp only (wa/mm/cli)
 *   npm run history -- --channel <jid>   # specific channel
 *   npm run history -- --search <query>  # search in content
 *   npm run history -- --since 2h        # last 2 hours (supports m/h/d)
 */
import { openDatabase, DEFAULT_DB_PATH } from '../memory/db.js';

const PLATFORM_ALIASES: Record<string, string> = {
  wa: 'whatsapp',
  whatsapp: 'whatsapp',
  mm: 'mattermost',
  mattermost: 'mattermost',
  cli: 'cli',
};

function parseArgs(args: string[]) {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const val = args[i + 1];
      if (!val || val.startsWith('--')) {
        flags[key] = 'true';
      } else {
        flags[key] = val;
        i++;
      }
    }
  }
  return flags;
}

function parseDuration(s: string): number {
  const match = s.match(/^(\d+)(m|h|d)$/);
  if (!match) {
    console.error(`Invalid duration: ${s} (use e.g. 30m, 2h, 1d)`);
    process.exit(1);
  }
  const n = parseInt(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000 };
  return n * multipliers[unit];
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function main() {
  const flags = parseArgs(process.argv.slice(2));

  if (flags.help) {
    console.log(`Usage: npm run history [-- options]

Options:
  --limit <n>         Number of messages (default: 20)
  --platform <p>      Filter by platform: wa, mm, cli
  --channel <id>      Filter by channel/JID
  --search <query>    Search in message content
  --since <duration>  Only messages from last N (e.g. 30m, 2h, 1d)
  --raw               Output as JSON
  --help              Show this help`);
    process.exit(0);
  }

  const db = openDatabase(DEFAULT_DB_PATH);
  try {
    const limit = parseInt(flags.limit ?? '20');
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (flags.platform) {
      const resolved = PLATFORM_ALIASES[flags.platform];
      if (!resolved) {
        console.error(`Unknown platform: ${flags.platform}. Use: wa, mm, cli`);
        process.exit(1);
      }
      conditions.push('platform = ?');
      params.push(resolved);
    }

    if (flags.channel) {
      conditions.push('channel_id = ?');
      params.push(flags.channel);
    }

    if (flags.search) {
      conditions.push('content LIKE ?');
      params.push(`%${flags.search}%`);
    }

    if (flags.since) {
      const cutoff = Date.now() - parseDuration(flags.since);
      conditions.push('timestamp > ?');
      params.push(cutoff);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `SELECT channel_id, role, sender, content, timestamp, platform
      FROM conversation_messages ${where}
      ORDER BY timestamp DESC LIMIT ?`;
    params.push(limit);

    const rows = db.prepare(query).all(...params) as Array<{
      channel_id: string; role: string; sender: string;
      content: string; timestamp: number; platform: string;
    }>;

    if (rows.length === 0) {
      console.log('No messages found.');
      return;
    }

    // Reverse to chronological order
    rows.reverse();

    if (flags.raw) {
      console.log(JSON.stringify(rows, null, 2));
      return;
    }

    for (const r of rows) {
      const time = formatTimestamp(r.timestamp);
      const plat = r.platform !== 'unknown' ? `[${r.platform}]` : '';
      const name = r.role === 'assistant' ? 'Claw' : r.sender;
      console.log(`${time} ${plat} ${name}: ${r.content}`);
      console.log('---');
    }

    console.log(`\n${rows.length} message(s)`);
  } finally {
    db.close();
  }
}

main();
