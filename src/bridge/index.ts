#!/usr/bin/env node
import 'dotenv/config';
import { existsSync, writeFileSync, unlinkSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from './config.js';
import { Bridge } from './bridge.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');
const LOCK_FILE = join(DATA_DIR, 'bridge.lock');

/**
 * Singleton: if a previous bridge is running, kill it.
 * Uses a PID lock file. Only the node worker PID is tracked —
 * parent wrapper processes (npm/tsx/sh) exit on their own when the worker dies.
 */
function ensureSingleton(): void {
  mkdirSync(DATA_DIR, { recursive: true });

  if (existsSync(LOCK_FILE)) {
    const oldPid = parseInt(readFileSync(LOCK_FILE, 'utf-8').trim());
    if (!isNaN(oldPid) && oldPid > 0 && oldPid !== process.pid) {
      try {
        process.kill(oldPid, 0); // throws if dead
        console.log(`[bridge] Killing previous instance (pid ${oldPid})`);
        process.kill(oldPid, 'SIGTERM');
        // Busy-wait up to 2s for it to die
        const deadline = Date.now() + 2000;
        while (Date.now() < deadline) {
          try { process.kill(oldPid, 0); } catch { break; }
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
        }
        // Force-kill if still alive
        try { process.kill(oldPid, 'SIGKILL'); } catch { /* dead */ }
      } catch {
        // Already dead — stale lock
      }
    }
  }

  writeFileSync(LOCK_FILE, String(process.pid));
  console.log(`[bridge] Lock acquired (pid ${process.pid})`);
}

function releaseLock(): void {
  try {
    if (existsSync(LOCK_FILE)) {
      const pid = parseInt(readFileSync(LOCK_FILE, 'utf-8').trim());
      if (pid === process.pid) unlinkSync(LOCK_FILE);
    }
  } catch { /* ok */ }
}

async function main() {
  ensureSingleton();

  const config = loadConfig();
  const bridge = new Bridge(config);

  const shutdown = () => {
    console.log('\n[bridge] Shutting down...');
    bridge.stop();
    releaseLock();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await bridge.start();
}

main().catch((err) => {
  console.error('[bridge] Fatal:', err);
  releaseLock();
  process.exit(1);
});
