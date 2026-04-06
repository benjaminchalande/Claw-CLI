/**
 * WhatsApp client wrapping Baileys.
 * Abstracts connection, message sending, and typing indicators.
 */

/** Minimal interface matching Baileys socket — allows mocking. */
export interface WASocket {
  sendMessage(jid: string, content: { text: string }): Promise<unknown>;
  sendPresenceUpdate(type: 'composing' | 'paused' | 'available', jid: string): Promise<void>;
  ev: {
    on(event: string, handler: (...args: any[]) => void): void;
  };
}

export interface WAMessage {
  id: string;
  jid: string;
  pushName: string;
  text: string;
  timestamp: number;
  fromMe: boolean;
  isGroup: boolean;
}

export type WAMessageHandler = (msg: WAMessage) => void;

export class WhatsAppClient {
  private sock: WASocket | null = null;
  /** IDs of messages WE sent — used to filter our own replies in self-chat. */
  private sentMessageIds = new Set<string>();

  attach(sock: WASocket, onMessage: WAMessageHandler): void {
    this.sock = sock;

    sock.ev.on('messages.upsert', (upsert: any) => {
      const { type, messages } = upsert;
      if (type !== 'notify' && type !== 'append') return;

      for (const msg of (messages ?? [])) {
        const text = msg.message?.conversation
          || msg.message?.extendedTextMessage?.text
          || '';
        if (!text) continue;

        const msgId = msg.key?.id ?? '';

        // Skip messages we sent ourselves
        if (this.sentMessageIds.has(msgId)) {
          this.sentMessageIds.delete(msgId);
          continue;
        }

        console.log(`[wa-client] msg text="${text.slice(0, 50)}"`);

        onMessage({
          id: msgId,
          jid: msg.key.remoteJid,
          pushName: msg.pushName ?? '',
          text,
          timestamp: (msg.messageTimestamp ?? 0) * 1000,
          fromMe: msg.key.fromMe ?? false,
          isGroup: msg.key.remoteJid?.endsWith('@g.us') ?? false,
        });
      }
    });
  }

  async sendText(jid: string, text: string): Promise<void> {
    if (!this.sock) throw new Error('WhatsApp not connected');
    const result = await this.sock.sendMessage(jid, { text }) as any;
    // Track the message ID so we can filter it when it comes back via upsert
    const sentId = result?.key?.id;
    if (sentId) {
      this.sentMessageIds.add(sentId);
      // Cleanup old IDs after 5 minutes
      setTimeout(() => this.sentMessageIds.delete(sentId), 300_000);
    }
  }

  async sendTyping(jid: string): Promise<void> {
    if (!this.sock) return;
    await this.sock.sendPresenceUpdate('composing', jid).catch(() => {});
  }

  async stopTyping(jid: string): Promise<void> {
    if (!this.sock) return;
    await this.sock.sendPresenceUpdate('paused', jid).catch(() => {});
  }
}
