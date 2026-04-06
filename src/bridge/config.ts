export interface BridgeConfig {
  /** Mattermost server URL (e.g. https://mm.example.com) */
  mmUrl: string;
  /** Bot access token */
  mmToken: string;
  /** Allowed channel IDs (empty = all channels) */
  allowedChannels: string[];
  /** Allow direct messages */
  allowDm: boolean;
  /** Path to the claude CLI binary */
  claudePath: string;
  /** Working directory for claude CLI */
  claudeCwd: string;
  /** Max concurrent claude processes */
  maxConcurrent: number;
  /** Timeout for claude process in ms */
  claudeTimeout: number;
}

export function loadConfig(): BridgeConfig {
  const mmUrl = requiredEnv('MM_URL');
  const mmToken = requiredEnv('MM_TOKEN');

  return {
    mmUrl: mmUrl.replace(/\/+$/, ''),
    mmToken,
    allowedChannels: optionalEnv('MM_ALLOWED_CHANNELS')?.split(',').filter(Boolean) ?? [],
    allowDm: optionalEnv('MM_ALLOW_DM') !== 'false',
    claudePath: optionalEnv('CLAUDE_PATH') ?? 'claude',
    claudeCwd: optionalEnv('CLAUDE_CWD') ?? process.cwd(),
    maxConcurrent: parseInt(optionalEnv('MAX_CONCURRENT') ?? '3'),
    claudeTimeout: parseInt(optionalEnv('CLAUDE_TIMEOUT') ?? '300000'), // 5 min
  };
}

function requiredEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optionalEnv(key: string): string | undefined {
  return process.env[key];
}
