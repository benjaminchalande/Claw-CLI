import { describe, it, expect } from 'vitest';
import { loadConfig } from '../config.js';

describe('BridgeConfig', () => {
  it('throws on missing MM_URL', () => {
    delete process.env.MM_URL;
    delete process.env.MM_TOKEN;
    expect(() => loadConfig()).toThrow('Missing required env var: MM_URL');
  });

  it('throws on missing MM_TOKEN', () => {
    process.env.MM_URL = 'https://mm.test.com';
    delete process.env.MM_TOKEN;
    expect(() => loadConfig()).toThrow('Missing required env var: MM_TOKEN');
  });

  it('loads config with defaults', () => {
    process.env.MM_URL = 'https://mm.test.com/';
    process.env.MM_TOKEN = 'test-token';
    delete process.env.MM_ALLOWED_CHANNELS;
    delete process.env.MM_ALLOW_DM;
    delete process.env.CLAUDE_PATH;

    const config = loadConfig();
    expect(config.mmUrl).toBe('https://mm.test.com'); // trailing slash stripped
    expect(config.mmToken).toBe('test-token');
    expect(config.allowedChannels).toEqual([]);
    expect(config.allowDm).toBe(true);
    expect(config.claudePath).toBe('claude');
    expect(config.maxConcurrent).toBe(3);
    expect(config.claudeTimeout).toBe(300000);

    // Cleanup
    delete process.env.MM_URL;
    delete process.env.MM_TOKEN;
  });

  it('parses allowed channels', () => {
    process.env.MM_URL = 'https://mm.test.com';
    process.env.MM_TOKEN = 'test-token';
    process.env.MM_ALLOWED_CHANNELS = 'ch1,ch2,ch3';

    const config = loadConfig();
    expect(config.allowedChannels).toEqual(['ch1', 'ch2', 'ch3']);

    delete process.env.MM_URL;
    delete process.env.MM_TOKEN;
    delete process.env.MM_ALLOWED_CHANNELS;
  });

  it('respects MM_ALLOW_DM=false', () => {
    process.env.MM_URL = 'https://mm.test.com';
    process.env.MM_TOKEN = 'test-token';
    process.env.MM_ALLOW_DM = 'false';

    const config = loadConfig();
    expect(config.allowDm).toBe(false);

    delete process.env.MM_URL;
    delete process.env.MM_TOKEN;
    delete process.env.MM_ALLOW_DM;
  });
});
