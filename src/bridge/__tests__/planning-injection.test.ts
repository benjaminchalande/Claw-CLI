/**
 * T53 — Injection du planning dans appendSystemPrompt.
 * Vérifie que activeSummary() se retrouve dans le contexte passé à invokeClaude.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { MockMattermost, OWNER_USER_ID } from './mock-mattermost.js';
import { Bridge } from '../bridge.js';
import type { BridgeConfig } from '../config.js';
import { invokeClaude } from '../claude.js';

process.env.MM_OWNER_USER_ID = OWNER_USER_ID;

const PLANNING_SUMMARY = 'Travail en cours :\n- [P1] Epic de test (0/1 tâches)\n  ○ Tâche de test';

// vi.hoisted garantit que mockActiveSummary est créé avant le hoisting de vi.mock
const { mockActiveSummary } = vi.hoisted(() => ({
  mockActiveSummary: vi.fn(),
}));

vi.mock('../claude.js', () => ({
  invokeClaude: vi.fn().mockResolvedValue({ output: 'ok', exitCode: 0 }),
}));

vi.mock('../init.js', () => ({
  initBridgeServices: vi.fn().mockReturnValue({
    db: {},
    memory: {
      read: vi.fn().mockReturnValue(null),
      write: vi.fn(),
      search: vi.fn().mockReturnValue([]),
    },
    planning: {
      activeSummary: mockActiveSummary,
    },
    scheduler: {
      activeSummary: vi.fn().mockReturnValue(''),
      dueJobs: vi.fn().mockReturnValue([]),
    },
    history: {
      add: vi.fn(),
      format: vi.fn().mockReturnValue(''),
    },
    systemPromptFile: '/tmp/system-prompt.md',
  }),
}));

describe('T53 — Injection du planning dans le prompt', () => {
  let mm: MockMattermost;
  let bridge: Bridge;

  beforeAll(async () => {
    mockActiveSummary.mockReturnValue(PLANNING_SUMMARY);

    mm = new MockMattermost();
    const port = await mm.start();

    const config: BridgeConfig = {
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

  it("inclut activeSummary() dans appendSystemPrompt passé à invokeClaude", async () => {
    vi.mocked(invokeClaude).mockClear();

    mm.simulatePost('quelle est la tâche en cours ?');
    await new Promise(r => setTimeout(r, 500));

    const calls = vi.mocked(invokeClaude).mock.calls;
    expect(calls).toHaveLength(1);
    const opts = calls[0][0];
    expect(opts.appendSystemPrompt).toContain(PLANNING_SUMMARY);
  });

  it("appendSystemPrompt ne contient pas de planning si activeSummary() retourne vide", async () => {
    vi.mocked(invokeClaude).mockClear();
    mockActiveSummary.mockReturnValueOnce('');

    mm.simulatePost('rien à faire pour toi');
    await new Promise(r => setTimeout(r, 500));

    const calls = vi.mocked(invokeClaude).mock.calls;
    expect(calls).toHaveLength(1);
    const opts = calls[0][0];
    expect(opts.appendSystemPrompt ?? '').not.toContain('Travail en cours');
  });
});
