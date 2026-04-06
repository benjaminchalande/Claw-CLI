import { describe, it, expect } from 'vitest';
import { ConversationHistory } from '../history.js';

describe('ConversationHistory', () => {
  it('stores and retrieves messages', () => {
    const h = new ConversationHistory();
    h.add('ch1', { role: 'user', sender: 'ben', content: 'salut', timestamp: Date.now() });
    expect(h.get('ch1')).toHaveLength(1);
    expect(h.get('ch1')[0].content).toBe('salut');
  });

  it('returns empty for unknown channel', () => {
    const h = new ConversationHistory();
    expect(h.get('unknown')).toEqual([]);
  });

  it('respects max per channel', () => {
    const h = new ConversationHistory(3);
    for (let i = 0; i < 5; i++) {
      h.add('ch1', { role: 'user', sender: 'ben', content: `msg ${i}`, timestamp: Date.now() });
    }
    expect(h.get('ch1')).toHaveLength(3);
    expect(h.get('ch1')[0].content).toBe('msg 2'); // oldest kept
  });

  it('evicts old messages', () => {
    const h = new ConversationHistory(20, 1); // 1 day max
    const twoDaysAgo = Date.now() - 2 * 86_400_000;
    h.add('ch1', { role: 'user', sender: 'ben', content: 'old', timestamp: twoDaysAgo });
    h.add('ch1', { role: 'user', sender: 'ben', content: 'new', timestamp: Date.now() });
    expect(h.get('ch1')).toHaveLength(1);
    expect(h.get('ch1')[0].content).toBe('new');
  });

  it('formats conversation history', () => {
    const h = new ConversationHistory();
    h.add('ch1', { role: 'user', sender: 'benjamin', content: 'salut', timestamp: Date.now() });
    h.add('ch1', { role: 'assistant', sender: 'claw-cli', content: 'hey !', timestamp: Date.now() });
    const formatted = h.format('ch1');
    expect(formatted).toContain('@benjamin: salut');
    expect(formatted).toContain('Claw CLI: hey !');
  });

  it('formats empty for no history', () => {
    const h = new ConversationHistory();
    expect(h.format('ch1')).toBe('');
  });

  it('separates channels', () => {
    const h = new ConversationHistory();
    h.add('ch1', { role: 'user', sender: 'a', content: 'ch1 msg', timestamp: Date.now() });
    h.add('ch2', { role: 'user', sender: 'b', content: 'ch2 msg', timestamp: Date.now() });
    expect(h.get('ch1')).toHaveLength(1);
    expect(h.get('ch2')).toHaveLength(1);
  });

  it('clear removes channel history', () => {
    const h = new ConversationHistory();
    h.add('ch1', { role: 'user', sender: 'a', content: 'msg', timestamp: Date.now() });
    h.clear('ch1');
    expect(h.get('ch1')).toEqual([]);
  });
});
