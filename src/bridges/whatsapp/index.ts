#!/usr/bin/env node
/**
 * WhatsApp bridge entry point.
 * Connects to WhatsApp via Baileys, then bridges messages to Claude.
 */
import 'dotenv/config';
import { existsSync, writeFileSync, unlinkSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { WhatsAppBridge } from './bridge.js';

const MM_URL = process.env.MM_URL ?? '';
const MM_TOKEN = process.env.MM_TOKEN ?? '';
const MM_DM_CHANNEL = process.env.MM_DM_CHANNEL ?? '';

async function sendQrToMattermost(qrData: string): Promise<void> {
  if (!MM_URL || !MM_TOKEN) {
    console.log('[wa] Pas de config MM, QR non envoyé');
    return;
  }
  // Generate PNG buffer
  const QRCode = await import('qrcode');
  const pngBuffer = await QRCode.default.toBuffer(qrData, { width: 400, margin: 2 });

  // Upload file to MM
  const form = new FormData();
  form.append('channel_id', MM_DM_CHANNEL);
  form.append('files', new Blob([pngBuffer], { type: 'image/png' }), 'whatsapp-qr.png');

  const uploadResp = await fetch(`${MM_URL}/api/v4/files`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${MM_TOKEN}` },
    body: form,
  });
  if (!uploadResp.ok) throw new Error(`Upload failed: ${uploadResp.status}`);
  const uploadData = await uploadResp.json() as { file_infos: { id: string }[] };
  const fileId = uploadData.file_infos[0].id;

  // Post message with file
  await fetch(`${MM_URL}/api/v4/posts`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${MM_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel_id: MM_DM_CHANNEL,
      message: '📱 Scanne ce QR code avec WhatsApp → Paramètres → Appareils liés → Lier un appareil',
      file_ids: [fileId],
    }),
  });
  console.log('[wa] QR code envoyé sur Mattermost');
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', '..', 'data');
const LOCK_FILE = join(DATA_DIR, 'whatsapp-bridge.lock');

function ensureSingleton(): void {
  mkdirSync(DATA_DIR, { recursive: true });
  if (existsSync(LOCK_FILE)) {
    const oldPid = parseInt(readFileSync(LOCK_FILE, 'utf-8').trim());
    if (!isNaN(oldPid) && oldPid > 0 && oldPid !== process.pid) {
      try {
        process.kill(oldPid, 0);
        console.log(`[wa] Killing previous instance (pid ${oldPid})`);
        process.kill(oldPid, 'SIGTERM');
        const deadline = Date.now() + 2000;
        while (Date.now() < deadline) {
          try { process.kill(oldPid, 0); } catch { break; }
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
        }
        try { process.kill(oldPid, 'SIGKILL'); } catch { /* dead */ }
      } catch { /* stale lock */ }
    }
  }
  writeFileSync(LOCK_FILE, String(process.pid));
  console.log(`[wa] Lock acquired (pid ${process.pid})`);
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

  const ownerPhone = process.env.WA_OWNER_PHONE;
  if (!ownerPhone) {
    console.error('[wa] Missing WA_OWNER_PHONE in .env');
    process.exit(1);
  }

  const sessionDir = process.env.WA_SESSION_DIR ?? join(DATA_DIR, 'whatsapp-session');
  mkdirSync(sessionDir, { recursive: true });

  const bridge = new WhatsAppBridge({
    ownerPhone,
    claudePath: process.env.CLAUDE_PATH ?? 'claude',
    claudeCwd: process.env.CLAUDE_CWD ?? process.cwd(),
    claudeTimeout: parseInt(process.env.CLAUDE_TIMEOUT ?? '120000'),
  });

  // Dynamic import of Baileys
  let baileys: any;
  try {
    baileys = await import('@whiskeysockets/baileys');
  } catch {
    console.error('[wa] @whiskeysockets/baileys not installed. Run: npm install @whiskeysockets/baileys');
    process.exit(1);
  }
  const {
    default: makeWASocket,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion,
    DisconnectReason,
  } = baileys;

  let qrTerminal: any;
  try {
    qrTerminal = await import('qrcode-terminal');
  } catch { /* optional */ }

  // Create a pino-compatible silent logger (Baileys needs it for makeCacheableSignalKeyStore)
  const pino = (await import('pino')).default;
  const logger = pino({ level: 'silent' });

  async function connectWA() {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();
    console.log(`[wa] Baileys version: ${version.join('.')}`);

    const sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      version,
      logger,
      browser: ['Claw CLI', 'Chrome', '20.0'],
      printQRInTerminal: false,
      syncFullHistory: true,
      markOnlineOnConnect: false,
    });

    sock.ev.on('creds.update', saveCreds);

    // Inject historical messages received during sync
    sock.ev.on('messaging-history.set', ({ messages }: { messages: any[] }) => {
      bridge.injectHistoryMessages(messages ?? []);
    });

    if (sock.ws && typeof sock.ws.on === 'function') {
      sock.ws.on('error', (err: Error) => console.error('[wa] WebSocket error:', err.message));
    }

    // Wait for connection to fully open, then start bridge
    sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('\n[wa] QR code reçu, envoi sur Mattermost...');
        sendQrToMattermost(qr).catch(err => console.error('[wa] QR MM send failed:', err));
      }
      if (connection === 'open') {
        console.log('[wa] Connected to WhatsApp');
        if (sock.user?.id) {
          bridge.addOwnerJid(sock.user.id);
          const bare = sock.user.id.replace(/:\d+@/, '@');
          bridge.addOwnerJid(bare);
        }
        try { await sock.sendPresenceUpdate('available'); } catch {}
        bridge.start(sock);
      }
      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code !== DisconnectReason.loggedOut) {
          console.log('[wa] Disconnected, reconnecting...');
          setTimeout(connectWA, 3000);
        } else {
          console.log('[wa] Logged out. Delete session dir and restart.');
          process.exit(0);
        }
      }
    });
  }

  const shutdown = () => {
    console.log('\n[wa] Shutting down...');
    releaseLock();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await connectWA();
}

main().catch((err) => {
  console.error('[wa] Fatal:', err);
  releaseLock();
  process.exit(1);
});
