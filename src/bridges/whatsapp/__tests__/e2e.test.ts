/**
 * E2E tests for WhatsApp bridge with mock Baileys socket.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MockWhatsApp, OWNER_JID, OWNER_PHONE } from './mock-whatsapp.js';
import { WhatsAppBridge } from '../bridge.js';

// Mock invokeClaude
vi.mock('../../../bridge/claude.js', () => ({
  invokeClaude: vi.fn().mockResolvedValue({ output: 'Réponse WA mock', exitCode: 0 }),
}));

let mock: MockWhatsApp;
let bridge: WhatsAppBridge;

beforeAll(() => {
  mock = new MockWhatsApp();
  bridge = new WhatsAppBridge({
    ownerPhone: OWNER_PHONE,
    claudePath: 'claude',
    claudeCwd: '/tmp',
    claudeTimeout: 10000,
  });
  bridge.start(mock);
});

beforeEach(() => {
  mock.sentMessages = [];
  mock.presenceUpdates = [];
});

describe('WhatsApp Bridge E2E', () => {
  it('responds to a message from the owner', async () => {
    mock.simulateMessage('salut');
    await new Promise(r => setTimeout(r, 300));

    const replies = mock.sentMessages.filter(m => m.text.includes('Réponse WA mock'));
    expect(replies).toHaveLength(1);
    expect(replies[0].jid).toBe(OWNER_JID);
  });

  it('ignores messages from non-owner', async () => {
    mock.simulateMessage('hello', {
      jid: '33699999999@s.whatsapp.net',
      pushName: 'Stranger',
    });
    await new Promise(r => setTimeout(r, 300));

    expect(mock.sentMessages).toHaveLength(0);
  });

  it('ignores group messages', async () => {
    mock.simulateMessage('hello group', {
      jid: '123456789-987654321@g.us',
      pushName: 'Benjamin',
    });
    await new Promise(r => setTimeout(r, 300));

    expect(mock.sentMessages).toHaveLength(0);
  });

  it('sends typing indicator while processing', async () => {
    mock.simulateMessage('test typing');
    await new Promise(r => setTimeout(r, 200));

    const composing = mock.presenceUpdates.filter(p => p.type === 'composing');
    expect(composing.length).toBeGreaterThanOrEqual(1);
    expect(composing[0].jid).toBe(OWNER_JID);
  });

  it('deduplicates same message ID', async () => {
    const id = 'dedup-test-id';
    mock.simulateMessage('dedup test', { id });
    mock.simulateMessage('dedup test', { id }); // same ID
    await new Promise(r => setTimeout(r, 300));

    const replies = mock.sentMessages.filter(m => m.text.includes('Réponse WA mock'));
    expect(replies).toHaveLength(1);
  });

  it('sends exactly one reply per message', async () => {
    mock.sentMessages = [];
    mock.simulateMessage('single reply');
    await new Promise(r => setTimeout(r, 300));

    const replies = mock.sentMessages.filter(m => m.text.includes('Réponse WA mock'));
    expect(replies).toHaveLength(1);
  });
});
