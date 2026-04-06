/**
 * WhatsApp bridge: message → Claude → reply.
 * Same architecture as the Mattermost bridge but for WhatsApp via Baileys.
 */
import { WhatsAppClient, type WASocket, type WAMessage } from './client.js';
import { invokeClaude } from '../../bridge/claude.js';
import { buildDynamicContext } from '../../bridge/prompt-builder.js';
import { initBridgeServices, type BridgeServices } from '../../bridge/init.js';

export interface WABridgeConfig {
  ownerPhone: string;   // e.g. '33612345678'
  claudePath: string;
  claudeCwd: string;
  claudeTimeout: number;
}

export class WhatsAppBridge {
  private wa = new WhatsAppClient();
  private services: BridgeServices;
  private config: WABridgeConfig;
  private activeCount = 0;
  private processedIds = new Set<string>();
  private ownerJid: string;
  /** Additional JIDs that belong to the owner (LID format for self-chat). */
  private ownerJids = new Set<string>();

  constructor(config: WABridgeConfig) {
    this.config = config;
    this.ownerJid = `${config.ownerPhone}@s.whatsapp.net`;
    this.ownerJids.add(this.ownerJid);
    this.services = initBridgeServices();
  }

  /** Register an additional JID as belonging to the owner (e.g. LID from sock.user). */
  addOwnerJid(jid: string): void {
    if (jid) {
      this.ownerJids.add(jid);
      console.log(`[wa-bridge] Owner JID added: ${jid}`);
    }
  }

  private isOwner(jid: string): boolean {
    // Accept known JIDs or any LID (WhatsApp Linked Identity for self-chat)
    // LID format: numbers@lid — used when messaging yourself
    return this.ownerJids.has(jid) || jid.endsWith('@lid');
  }

  /** Attach a Baileys socket (real or mock) and start listening. */
  start(sock: WASocket): void {
    this.wa.attach(sock, (msg) => this.handleMessage(msg));
    console.log(`[wa-bridge] Listening (owner JIDs: ${[...this.ownerJids].join(', ')})`);
  }

  /**
   * Inject historical messages received from WhatsApp during sync.
   * Called when Baileys emits 'messaging-history.set' at connection time.
   * Only stores messages from the owner's JIDs (self-chat).
   */
  injectHistoryMessages(messages: any[]): void {
    let injected = 0;
    for (const msg of messages) {
      const text = msg.message?.conversation
        || msg.message?.extendedTextMessage?.text
        || '';
      if (!text) continue;

      const jid: string = msg.key?.remoteJid ?? '';
      if (!jid) continue;

      // Only keep messages from/to owner JIDs
      if (!this.isOwner(jid)) continue;

      const timestamp = (msg.messageTimestamp ?? 0) * 1000;
      const fromMe: boolean = msg.key?.fromMe ?? false;

      this.services.history.add(jid, { platform: 'whatsapp',
        role: fromMe ? 'assistant' : 'user',
        sender: fromMe ? 'claw-cli' : (msg.pushName || 'user'),
        content: text,
        timestamp,
      });
      injected++;
    }
    if (injected > 0) {
      console.log(`[wa-bridge] History sync: ${injected} messages injected (out of ${messages.length})`);
    }
  }

  private async handleMessage(msg: WAMessage): Promise<void> {
    // Ignore groups
    if (msg.isGroup) return;

    // Hard block: owner only (accept both @s.whatsapp.net and @lid formats)
    if (!this.isOwner(msg.jid)) {
      console.log(`[wa-bridge] Blocked non-owner ${msg.jid}`);
      return;
    }

    // Dedup
    if (this.processedIds.has(msg.id)) return;
    this.processedIds.add(msg.id);
    if (this.processedIds.size > 500) {
      this.processedIds.delete(this.processedIds.values().next().value!);
    }

    // Rate limit
    if (this.activeCount >= 2) return;

    this.processMessage(msg).catch((err) => {
      console.error('[wa-bridge] Error:', err);
    });
  }

  private async processMessage(msg: WAMessage): Promise<void> {
    this.activeCount++;

    const typingInterval = setInterval(() => this.wa.sendTyping(msg.jid), 3000);
    await this.wa.sendTyping(msg.jid);

    try {
      console.log(`[wa-bridge] "${msg.text.slice(0, 80)}" from ${msg.pushName}`);

      // Record in history
      this.services.history.add(msg.jid, { platform: 'whatsapp',
        role: 'user',
        sender: msg.pushName || 'user',
        content: msg.text,
        timestamp: msg.timestamp || Date.now(),
      });

      // Build context
      const dynamicContext = [
        buildDynamicContext({
          senderName: msg.pushName || 'user',
          memory: this.services.memory,
          message: msg.text,
          platform: 'whatsapp',
        }),
        this.services.planning.activeSummary(),
        this.services.history.format(msg.jid),
        this.services.history.formatCrossChannel(msg.jid),
      ].filter(Boolean).join('\n\n');

      // Invoke Claude
      let result = await invokeClaude({
        prompt: msg.text,
        claudePath: this.config.claudePath,
        cwd: this.config.claudeCwd,
        timeout: this.config.claudeTimeout,
        systemPromptFile: this.services.systemPromptFile,
        appendSystemPrompt: dynamicContext || undefined,
        allowTools: true,
        model: 'sonnet',
      });

      // Fallback on timeout
      if (!result.output && (result.exitCode === 143 || result.exitCode === null)) {
        console.log('[wa-bridge] Timeout, retrying without tools...');
        result = await invokeClaude({
          prompt: msg.text,
          claudePath: this.config.claudePath,
          cwd: this.config.claudeCwd,
          timeout: 60_000,
          systemPromptFile: this.services.systemPromptFile,
          model: 'haiku',
        });
      }

      await this.wa.stopTyping(msg.jid);

      if (!result.output) {
        console.warn(`[wa-bridge] No output (exit=${result.exitCode})`);
        return;
      }

      // Record response
      this.services.history.add(msg.jid, { platform: 'whatsapp',
        role: 'assistant',
        sender: 'claw-cli',
        content: result.output.slice(0, 2000),
        timestamp: Date.now(),
      });

      // Send reply with prefix for visibility in self-chat
      const prefixed = `[Claw CLI] ${result.output}`;
      const chunks = splitWAMessage(prefixed, 4000);
      for (const chunk of chunks) {
        await this.wa.sendText(msg.jid, chunk);
      }

      console.log(`[wa-bridge] Replied (${result.output.length} chars)`);
    } catch (err) {
      console.error('[wa-bridge] Claude failed:', err);
    } finally {
      clearInterval(typingInterval);
      await this.wa.stopTyping(msg.jid);
      this.activeCount--;
    }
  }
}

function splitWAMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) { chunks.push(remaining); break; }
    let idx = remaining.lastIndexOf('\n', maxLen);
    if (idx < maxLen * 0.5) idx = remaining.lastIndexOf(' ', maxLen);
    if (idx < maxLen * 0.3) idx = maxLen;
    chunks.push(remaining.slice(0, idx));
    remaining = remaining.slice(idx).trimStart();
  }
  return chunks;
}
