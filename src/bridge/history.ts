/**
 * Conversation history — cross-channel, persistent.
 * Stores messages from all platforms (CLI, Mattermost, WhatsApp)
 * in a shared SQLite database.
 */
import type Database from 'better-sqlite3';

export type Platform = 'cli' | 'mattermost' | 'whatsapp' | 'unknown';

export interface HistoryMessage {
  role: 'user' | 'assistant';
  sender: string;
  content: string;
  timestamp: number;
  platform?: Platform;
}

export class ConversationHistory {
  constructor(
    private maxPerChannel = 20,
    private maxAgeDays = 1,
    private db: Database.Database | null = null,
  ) {}

  private channels = new Map<string, HistoryMessage[]>();

  add(channelId: string, msg: HistoryMessage): void {
    const platform = msg.platform ?? 'unknown';

    if (this.db) {
      this.db.prepare(`
        INSERT INTO conversation_messages (channel_id, role, sender, content, timestamp, platform)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(channelId, msg.role, msg.sender, msg.content.slice(0, 5000), msg.timestamp, platform);

      const cutoff = Date.now() - this.maxAgeDays * 86_400_000;
      this.db.prepare('DELETE FROM conversation_messages WHERE timestamp < ?').run(cutoff);
      return;
    }

    // In-memory fallback (tests)
    let history = this.channels.get(channelId);
    if (!history) {
      history = [];
      this.channels.set(channelId, history);
    }
    history.push({ ...msg, platform });

    const cutoff = Date.now() - this.maxAgeDays * 86_400_000;
    while (history.length > 0 && history[0].timestamp < cutoff) {
      history.shift();
    }
    while (history.length > this.maxPerChannel) {
      history.shift();
    }
  }

  /** Get messages for a specific channel. */
  get(channelId: string): HistoryMessage[] {
    if (this.db) {
      return this.db.prepare(`
        SELECT role, sender, content, timestamp, platform
        FROM conversation_messages
        WHERE channel_id = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `).all(channelId, this.maxPerChannel).reverse() as HistoryMessage[];
    }
    return this.channels.get(channelId) ?? [];
  }

  /** Get recent messages across ALL channels/platforms. */
  getRecent(limit = 10): HistoryMessage[] {
    if (this.db) {
      return this.db.prepare(`
        SELECT role, sender, content, timestamp, platform
        FROM conversation_messages
        ORDER BY timestamp DESC
        LIMIT ?
      `).all(limit).reverse() as HistoryMessage[];
    }
    // In-memory: merge all channels
    const all: HistoryMessage[] = [];
    for (const msgs of this.channels.values()) all.push(...msgs);
    return all.sort((a, b) => a.timestamp - b.timestamp).slice(-limit);
  }

  /** Format channel-specific history for prompt injection. */
  format(channelId: string): string {
    const messages = this.get(channelId);
    if (messages.length === 0) return '';

    const lines = messages.map(m => {
      const prefix = m.role === 'user' ? `@${m.sender}` : 'Claw CLI';
      return `${prefix}: ${m.content}`;
    });

    return `Historique récent de cette conversation :\n${lines.join('\n')}`;
  }

  /** Format cross-channel history for prompt injection. */
  formatCrossChannel(currentChannelId: string, limit = 5): string {
    if (!this.db) return '';

    const messages = this.db.prepare(`
      SELECT role, sender, content, timestamp, platform
      FROM conversation_messages
      WHERE channel_id != ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(currentChannelId, limit).reverse() as HistoryMessage[];

    if (messages.length === 0) return '';

    const lines = messages.map(m => {
      const tag = m.platform ? `[${m.platform}]` : '';
      const prefix = m.role === 'user' ? `@${m.sender}` : 'Claw CLI';
      return `${tag} ${prefix}: ${m.content}`;
    });

    return `Conversations récentes sur d'autres canaux :\n${lines.join('\n')}`;
  }

  clear(channelId: string): void {
    if (this.db) {
      this.db.prepare('DELETE FROM conversation_messages WHERE channel_id = ?').run(channelId);
      return;
    }
    this.channels.delete(channelId);
  }
}
