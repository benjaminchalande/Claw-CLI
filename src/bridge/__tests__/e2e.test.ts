/**
 * End-to-end tests with mock Mattermost server.
 * Tests the full flow: message → bridge → (mock) claude → reply.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MockMattermost, OWNER_USER_ID } from './mock-mattermost.js';
import { Bridge } from '../bridge.js';
import type { BridgeConfig } from '../config.js';

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
    await new Promise(r => setTimeout(r, 500));

    // Should have a thinking message updated to the real response
    const hasResponse = mm.postedMessages.some(p => p.message === 'Réponse mock');
    expect(hasResponse).toBe(true);
  });

  it('replies directly in channel, never in a thread', async () => {
    mm.simulatePost('test direct reply');
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

  it('posts at least one message per user message', async () => {
    mm.simulatePost('test message');
    await new Promise(r => setTimeout(r, 500));

    // Should have at least the thinking + response (or thinking updated to response)
    expect(mm.postedMessages.length).toBeGreaterThanOrEqual(1);
  });
});
