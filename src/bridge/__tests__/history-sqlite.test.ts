import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ConversationHistory } from '../history.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION = readFileSync(join(__dirname, '..', '..', '..', 'migrations', '003_history.sql'), 'utf-8');

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(MIGRATION);
});

afterEach(() => db.close());

describe('ConversationHistory with SQLite', () => {
  it('persists messages', () => {
    const h = new ConversationHistory(20, 1, db);
    h.add('ch1', { role: 'user', sender: 'ben', content: 'salut', timestamp: Date.now() });

    // Create a new instance pointing to same db
    const h2 = new ConversationHistory(20, 1, db);
    const messages = h2.get('ch1');
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('salut');
  });

  it('limits to maxPerChannel', () => {
    const h = new ConversationHistory(3, 1, db);
    for (let i = 0; i < 5; i++) {
      h.add('ch1', { role: 'user', sender: 'ben', content: `msg ${i}`, timestamp: Date.now() + i });
    }
    const messages = h.get('ch1');
    expect(messages).toHaveLength(3);
    expect(messages[0].content).toBe('msg 2');
  });

  it('clears channel messages', () => {
    const h = new ConversationHistory(20, 1, db);
    h.add('ch1', { role: 'user', sender: 'ben', content: 'x', timestamp: Date.now() });
    h.clear('ch1');
    expect(h.get('ch1')).toHaveLength(0);
  });

  it('formats conversation', () => {
    const h = new ConversationHistory(20, 1, db);
    h.add('ch1', { role: 'user', sender: 'ben', content: 'hello', timestamp: Date.now() });
    h.add('ch1', { role: 'assistant', sender: 'bot', content: 'hey', timestamp: Date.now() + 1 });

    const formatted = h.format('ch1');
    expect(formatted).toContain('@ben: hello');
    expect(formatted).toContain('Claw CLI: hey');
  });

  it('separates channels', () => {
    const h = new ConversationHistory(20, 1, db);
    h.add('ch1', { role: 'user', sender: 'a', content: 'ch1', timestamp: Date.now() });
    h.add('ch2', { role: 'user', sender: 'b', content: 'ch2', timestamp: Date.now() });
    expect(h.get('ch1')).toHaveLength(1);
    expect(h.get('ch2')).toHaveLength(1);
  });

  it('truncates long content', () => {
    const h = new ConversationHistory(20, 1, db);
    const longContent = 'x'.repeat(10000);
    h.add('ch1', { role: 'user', sender: 'ben', content: longContent, timestamp: Date.now() });
    const messages = h.get('ch1');
    expect(messages[0].content.length).toBeLessThanOrEqual(5000);
  });
});
