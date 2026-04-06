import { spawn } from 'child_process';

export interface ClaudeResult {
  output: string;
  exitCode: number | null;
}

export interface ClaudeOptions {
  /** The user message */
  prompt: string;
  /** Path to the claude CLI binary */
  claudePath: string;
  /** Working directory */
  cwd: string;
  /** Timeout in ms */
  timeout: number;
  /** Path to system prompt file (soul+mind+personality) */
  systemPromptFile?: string;
  /** Dynamic context to append to system prompt (memory, profile) */
  appendSystemPrompt?: string;
  /** Allow tools (Read, Grep, etc.) */
  allowTools?: boolean;
  /** Model override (default: sonnet for speed) */
  model?: string;
  /** Session ID for conversation persistence */
  sessionId?: string;
}

/**
 * Invoke Claude Code CLI with proper separation of system prompt and user message.
 */
export function invokeClaude(opts: ClaudeOptions): Promise<ClaudeResult> {
  return new Promise((resolve, reject) => {
    const args = ['--print', '--output-format', 'text'];

    // System prompt from file (soul + mind + personality)
    if (opts.systemPromptFile) {
      args.push('--system-prompt-file', opts.systemPromptFile);
    }

    // Dynamic context appended to system prompt (memory search results, user profile)
    if (opts.appendSystemPrompt) {
      args.push('--append-system-prompt', opts.appendSystemPrompt);
    }

    // Model selection (default sonnet for conversational speed)
    args.push('--model', opts.model ?? 'sonnet');

    // Session persistence
    if (opts.sessionId) {
      args.push('--session-id', opts.sessionId);
    }

    // Tools
    if (opts.allowTools) {
      args.push('--allowedTools', 'Read,Grep,Glob,Bash(npm run memory:*),WebSearch,WebFetch');
    }

    console.log(`[claude] Spawning: model=${opts.model ?? 'sonnet'} session=${opts.sessionId?.slice(0, 8) ?? 'none'} tools=${!!opts.allowTools}`);

    const proc = spawn(opts.claudePath, args, {
      cwd: opts.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: opts.timeout,
      env: { ...process.env },
    });

    // Write user message to stdin
    proc.stdin.on('error', () => {});
    proc.stdin.write(opts.prompt);
    proc.stdin.end();

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('error', (err) => {
      console.error(`[claude] Spawn error: ${err.message}`);
      reject(new Error(`Failed to spawn claude: ${err.message}`));
    });

    proc.on('close', (code) => {
      console.log(`[claude] Finished (exit=${code}, ${stdout.length} chars)`);
      if (stderr && code !== 0) {
        console.error(`[claude] stderr: ${stderr.slice(0, 500)}`);
      }
      resolve({ output: stdout.trim(), exitCode: code });
    });
  });
}
