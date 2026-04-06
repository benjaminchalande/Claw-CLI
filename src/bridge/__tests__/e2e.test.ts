/**
 * End-to-end tests with mock Mattermost server.
 * Tests the full flow: message → bridge → (mock) claude → reply.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MockMattermost, OWNER_USER_ID } from './mock-mattermost.js';
import { Bridge } from '../bridge.js';
import type { BridgeConfig } from '../config.js';

// Set env for owner check in bridge
process.env.MM_OWNER_USER_ID = OWNER_USER_ID;

vi.mock('../claude.js', () => ({
  invokeClaude: vi.fn().mockResolvedValue({ output: 'Réponse mock', exitCode: 0 }),
}));

let mm: MockMattermost;
let bridge: Bridge;
let config: BridgeConfig;

beforeAll(async () => {
  mm = new MockMattermost();
  const port = await mm.start();

  config = {
    mmUrl: `http://localhost:${port}`,
    mmToken: 'test-token',
    allowedChannels: [],
    allowDm: true,
    claudePath: 'claude',
    claudeCwd: '/tmp',
    maxConcurrent: 3,
    claudeTimeout: 10000,
  };

  bridge = new Bridge(config);
  await bridge.start();
  // Let WebSocket settle
  await new Promise(r => setTimeout(r, 200));
});

afterAll(async () => {
  bridge.stop();
  await mm.stop();
});

beforeEach(() => {
  mm.postedMessages = [];
  mm.reactions = [];
});

describe('Bridge E2E', () => {
  it('responds to a message from the owner', async () => {
    mm.simulatePost('salut');
    // Wait for processing
    await new Promise(r => setTimeout(r, 500));

    // Should have posted a reply
    const replies = mm.postedMessages.filter(p => p.message !== 'Oui ?');
    expect(replies.length).toBeGreaterThanOrEqual(1);
    expect(replies[0].message).toBe('Réponse mock');
  });

  it('replies directly in channel, never in a thread', async () => {
    mm.simulatePost('test direct reply');
    await new Promise(r => setTimeout(r, 500));

    // All replies should have empty root_id
    for (const post of mm.postedMessages) {
      expect(post.root_id).toBe('');
    }
  });

  it('replies directly even when original message is in a thread', async () => {
    mm.simulatePost('reply in thread', { rootId: 'some-thread-root-id' });
    await new Promise(r => setTimeout(r, 500));

    for (const post of mm.postedMessages) {
      expect(post.root_id).toBe('');
    }
  });

  it('ignores messages from non-owner users', async () => {
    mm.simulatePost('hello from stranger', {
      userId: 'stranger-id',
      senderName: 'stranger',
    });
    await new Promise(r => setTimeout(r, 500));

    expect(mm.postedMessages).toHaveLength(0);
  });

  it('adds eyes reaction on receipt', async () => {
    mm.simulatePost('reaction test');
    await new Promise(r => setTimeout(r, 300));

    const eyesReactions = mm.reactions.filter(r => r.emoji_name === 'eyes');
    expect(eyesReactions.length).toBeGreaterThanOrEqual(1);
  });

  it('deduplicates same message', async () => {
    // Send the exact same event twice (same post ID via simulatePost)
    const postId = `dedup-${Date.now()}`;
    const event = {
      event: 'posted',
      data: {
        post: JSON.stringify({
          id: postId,
          user_id: OWNER_USER_ID,
          channel_id: 'test-channel',
          message: 'dedup test',
          root_id: '',
          type: '',
          create_at: Date.now(),
        }),
        channel_type: 'D',
        sender_name: 'benjamin-chalande',
      },
      seq: Date.now(),
    };

    // Access the WebSocket clients to send raw events
    // (We can't use simulatePost because it generates a unique ID each time)
    const ws = (mm as any).wsClients[0];
    ws.send(JSON.stringify(event));
    ws.send(JSON.stringify(event)); // duplicate
    await new Promise(r => setTimeout(r, 500));

    // Should only have ONE reply (not two)
    const replies = mm.postedMessages.filter(p => p.message === 'Réponse mock');
    expect(replies).toHaveLength(1);
  });

  it('only one bridge reply per message', async () => {
    mm.postedMessages = [];
    mm.simulatePost('single reply test');
    await new Promise(r => setTimeout(r, 500));

    const replies = mm.postedMessages.filter(p => p.message === 'Réponse mock');
    expect(replies).toHaveLength(1);
  });
});
