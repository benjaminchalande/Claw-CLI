/**
 * Conversation history buffer per channel.
 * Supports in-memory (for tests) and SQLite-backed (for production) modes.
 */
import type Database from 'better-sqlite3';

export interface HistoryMessage {
  role: 'user' | 'assistant';
  sender: string;
  content: string;
  timestamp: number;
}

export class ConversationHistory {
  constructor(
    private maxPerChannel = 20,
    private maxAgeDays = 1,
    private db: Database.Database | null = null,
  ) {}

  /** In-memory fallback (used when no db provided) */
  private channels = new Map<string, HistoryMessage[]>();

  add(channelId: string, msg: HistoryMessage): void {
    if (this.db) {
      this.db.prepare(`
        INSERT INTO conversation_messages (channel_id, role, sender, content, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `).run(channelId, msg.role, msg.sender, msg.content.slice(0, 5000), msg.timestamp);

      // Cleanup old messages
      const cutoff = Date.now() - this.maxAgeDays * 86_400_000;
      this.db.prepare('DELETE FROM conversation_messages WHERE timestamp < ?').run(cutoff);
      return;
    }

    // In-memory fallback
    let history = this.channels.get(channelId);
    if (!history) {
      history = [];
      this.channels.set(channelId, history);
    }
    history.push(msg);

    const cutoff = Date.now() - this.maxAgeDays * 86_400_000;
    while (history.length > 0 && history[0].timestamp < cutoff) {
      history.shift();
    }
    while (history.length > this.maxPerChannel) {
      history.shift();
    }
  }

  get(channelId: string): HistoryMessage[] {
    if (this.db) {
      return this.db.prepare(`
        SELECT role, sender, content, timestamp
        FROM conversation_messages
        WHERE channel_id = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `).all(channelId, this.maxPerChannel).reverse() as HistoryMessage[];
    }

    return this.channels.get(channelId) ?? [];
  }

  format(channelId: string): string {
    const messages = this.get(channelId);
    if (messages.length === 0) return '';

    const lines = messages.map(m => {
      const prefix = m.role === 'user' ? `@${m.sender}` : 'Claw CLI';
      return `${prefix}: ${m.content}`;
    });

    return `Historique récent de cette conversation :\n${lines.join('\n')}`;
  }

  clear(channelId: string): void {
    if (this.db) {
      this.db.prepare('DELETE FROM conversation_messages WHERE channel_id = ?').run(channelId);
      return;
    }
    this.channels.delete(channelId);
  }
}
