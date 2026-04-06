/**
 * Mock WhatsApp socket emulating the Baileys API.
 * Same pattern as MockMattermost — allows full E2E testing without a real phone.
 */
import type { WASocket } from '../client.js';
import { EventEmitter } from 'events';

export const OWNER_PHONE = '33612345678';
export const OWNER_JID = `${OWNER_PHONE}@s.whatsapp.net`;

export interface SentMessage {
  jid: string;
  text: string;
}

export class MockWhatsApp implements WASocket {
  private emitter = new EventEmitter();

  /** Messages sent by the bridge (replies). */
  sentMessages: SentMessage[] = [];
  /** Presence updates sent. */
  presenceUpdates: { type: string; jid: string }[] = [];

  ev = {
    on: (event: string, handler: (...args: any[]) => void) => {
      this.emitter.on(event, handler);
    },
  };

  async sendMessage(jid: string, content: { text: string }): Promise<unknown> {
    this.sentMessages.push({ jid, text: content.text });
    return {};
  }

  async sendPresenceUpdate(type: 'composing' | 'paused' | 'available', jid: string): Promise<void> {
    this.presenceUpdates.push({ type, jid });
  }

  /** Simulate an incoming message from a user. */
  simulateMessage(text: string, opts?: {
    jid?: string;
    pushName?: string;
    id?: string;
    isGroup?: boolean;
  }): void {
    const jid = opts?.jid ?? OWNER_JID;
    const msg = {
      key: {
        remoteJid: jid,
        fromMe: false,
        id: opts?.id ?? `mock-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      },
      message: { conversation: text },
      pushName: opts?.pushName ?? 'Benjamin',
      messageTimestamp: Math.floor(Date.now() / 1000),
    };

    this.emitter.emit('messages.upsert', {
      type: 'notify',
      messages: [msg],
    });
  }
}
