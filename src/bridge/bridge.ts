import { MattermostClient, type PostedEvent } from './mattermost.js';
import { invokeClaude } from './claude.js';
import { buildDynamicContext } from './prompt-builder.js';
import { initBridgeServices, type BridgeServices } from './init.js';
import type { MemoryStore } from '../memory/store.js';
import type { PlanningStore } from '../planning/store.js';
import type { ConversationHistory } from './history.js';
import type { BridgeConfig } from './config.js';
import { runDueJobs } from '../scheduler/runner.js';
import { type SchedulerStore } from '../scheduler/store.js';
import {
  parseCommand,
  handleCommand,
  ParseError,
} from './commands/commandRouter.js';
import { parseReminderMessage, formatReminderEta } from './commands/reminderParser.js';

function getOwnerUserId(): string {
  return process.env.MM_OWNER_USER_ID ?? '';
}

const SCHEDULER_INTERVAL_MS = 60_000; // 1 minute

export class Bridge {
  private mm: MattermostClient;
  private memory: MemoryStore;
  private planning: PlanningStore;
  private history: ConversationHistory;
  private scheduler: SchedulerStore;
  private systemPromptFile: string;
  private activeCount = 0;
  private processedPosts = new Set<string>();
  private schedulerTimer: ReturnType<typeof setInterval> | null = null;
  private schedulerRunning = false;

  constructor(private config: BridgeConfig) {
    this.mm = new MattermostClient(config.mmUrl, config.mmToken);
    const services = initBridgeServices();
    this.memory = services.memory;
    this.planning = services.planning;
    this.history = services.history;
    this.scheduler = services.scheduler;
    this.systemPromptFile = services.systemPromptFile;
  }

  async start(): Promise<void> {
    console.log('[bridge] Starting...');
    await this.mm.connect((event) => this.handlePost(event));
    this.startSchedulerLoop();
    console.log('[bridge] Ready and listening');
  }

  stop(): void {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    this.mm.disconnect();
    console.log('[bridge] Stopped');
  }

  private startSchedulerLoop(): void {
    // Première exécution immédiate au démarrage
    this.tickScheduler();
    this.schedulerTimer = setInterval(() => this.tickScheduler(), SCHEDULER_INTERVAL_MS);
    console.log('[bridge] Scheduler loop started (every 60s)');
  }

  private tickScheduler(): void {
    if (this.schedulerRunning) return; // évite les chevauchements
    this.schedulerRunning = true;

    const notifyConfig = {
      mmUrl: this.config.mmUrl,
      mmToken: this.config.mmToken,
      botUserId: this.mm.botUserId,
    };

    runDueJobs(this.scheduler, {
      claudePath: this.config.claudePath,
      timeout: this.config.claudeTimeout,
      projectDir: this.config.claudeCwd,
      notify: notifyConfig,
    }).then((count) => {
      if (count > 0) console.log(`[scheduler] ${count} job(s) exécuté(s)`);
    }).catch((err) => {
      console.error('[scheduler] Erreur lors de l\'exécution des jobs:', err);
    }).finally(() => {
      this.schedulerRunning = false;
    });
  }

  private async handlePost(event: PostedEvent): Promise<void> {
    const { post, channel_type } = event;

    if (post.user_id === this.mm.botUserId) return;
    if (post.type && post.type !== '') return;
    if (post.user_id !== getOwnerUserId()) return;

    if (this.processedPosts.has(post.id)) return;
    this.processedPosts.add(post.id);
    if (this.processedPosts.size > 500) {
      this.processedPosts.delete(this.processedPosts.values().next().value!);
    }

    if (channel_type === 'D' && !this.config.allowDm) return;
    if (this.config.allowedChannels.length > 0) {
      if (!this.config.allowedChannels.includes(post.channel_id) && channel_type !== 'D') return;
    }
    if (channel_type !== 'D' && !this.mentionRegex().test(post.message)) return;

    if (this.activeCount >= this.config.maxConcurrent) {
      await this.mm.createPost(post.channel_id, 'Je suis occupé, réessaie dans un moment.');
      return;
    }

    this.processMessage(event).catch((err) => {
      console.error('[bridge] Error processing message:', err);
    });
  }

  private async processMessage(event: PostedEvent): Promise<void> {
    const { post } = event;
    this.activeCount++;

    this.mm.sendTyping(post.channel_id);
    const typingInterval = setInterval(() => this.mm.sendTyping(post.channel_id), 3000);

    try {
      await this.mm.addReaction(post.id, 'eyes').catch(() => {});

      const cleanMessage = post.message.replace(this.mentionRegex(), '').trim();
      if (!cleanMessage) {
        await this.mm.removeReaction(post.id, 'eyes').catch(() => {});
        await this.mm.createPost(post.channel_id, 'Oui ?');
        return;
      }

      console.log(`[bridge] "${cleanMessage.slice(0, 80)}" from ${event.sender_name}`);

      // Routing direct des commandes (!schedule, !remind) sans passer par le LLM
      const scheduleResult = await this.handleDirectCommand(cleanMessage, post.channel_id);
      if (scheduleResult !== null) {
        await this.mm.removeReaction(post.id, 'eyes').catch(() => {});
        await this.mm.addReaction(post.id, 'white_check_mark').catch(() => {});
        await this.mm.createPost(post.channel_id, scheduleResult);
        return;
      }

      const dynamicContext = [
        buildDynamicContext({
          senderName: event.sender_name,
          memory: this.memory,
          message: cleanMessage,
          platform: 'mattermost',
        }),
        this.planning.activeSummary(),
        this.scheduler.activeSummary(),
        this.history.format(post.channel_id),
      ].filter(Boolean).join('\n\n');

      let result = await invokeClaude({
        prompt: cleanMessage,
        claudePath: this.config.claudePath,
        cwd: this.config.claudeCwd,
        timeout: 120_000,
        systemPromptFile: this.systemPromptFile,
        appendSystemPrompt: dynamicContext || undefined,
        allowTools: true,
        model: 'sonnet',
      });

      // Fallback on timeout: retry without tools on faster model
      if (!result.output && (result.exitCode === 143 || result.exitCode === null)) {
        console.log('[bridge] Timeout, retrying without tools...');
        result = await invokeClaude({
          prompt: cleanMessage,
          claudePath: this.config.claudePath,
          cwd: this.config.claudeCwd,
          timeout: 60_000,
          systemPromptFile: this.systemPromptFile,
          model: 'haiku',
        });
      }

      await this.mm.removeReaction(post.id, 'eyes').catch(() => {});

      if (!result.output) {
        console.warn(`[bridge] No output (exit=${result.exitCode})`);
        await this.mm.addReaction(post.id, 'warning').catch(() => {});
        return;
      }

      await this.mm.addReaction(post.id, 'white_check_mark').catch(() => {});

      this.history.add(post.channel_id, {
        role: 'user', sender: event.sender_name,
        content: cleanMessage, timestamp: post.create_at,
      });

      this.history.add(post.channel_id, {
        role: 'assistant', sender: this.mm.botUsername,
        content: result.output.slice(0, 2000), timestamp: Date.now(),
      });

      const chunks = splitMessage(result.output, 15000);
      for (const chunk of chunks) {
        await this.mm.createPost(post.channel_id, chunk);
      }

      console.log(`[bridge] Replied (${result.output.length} chars)`);
    } catch (err) {
      console.error('[bridge] Error:', err);
      await this.mm.removeReaction(post.id, 'eyes').catch(() => {});
      await this.mm.addReaction(post.id, 'x').catch(() => {});
    } finally {
      clearInterval(typingInterval);
      this.activeCount--;
    }
  }

  /**
   * Tente de parser et exécuter une commande directe ou un reminder naturel.
   * Ordre de détection : !reminders, !annuler, !remind, !schedule, langage naturel.
   * Retourne le message de réponse, ou null si rien ne correspond.
   */
  private async handleDirectCommand(message: string, channelId: string): Promise<string | null> {
    // 1. Commandes explicites (!schedule, !remind, !reminders, !annuler)
    let command;
    try {
      command = parseCommand(message);
    } catch (err) {
      if (err instanceof ParseError) return err.message;
      throw err;
    }

    if (command !== null) {
      return handleCommand(command, {
        store: this.scheduler,
        claudePath: this.config.claudePath,
        projectDir: this.config.claudeCwd,
        claudeTimeout: this.config.claudeTimeout,
        channelId,
      });
    }

    // 2. Langage naturel : "rappelle-moi de X dans 2h"
    const reminder = parseReminderMessage(message);
    if (reminder !== null) {
      return this.createNaturalReminder(reminder.message, reminder.when, channelId);
    }

    return null;
  }

  /** Crée un rappel depuis le parser naturel et retourne la confirmation. */
  private createNaturalReminder(message: string, when: Date, channelId: string): string {
    const name = `remind-${Date.now()}`;
    const job = this.scheduler.create({
      name,
      description: message,
      schedule_type: 'once',
      schedule_value: when.toISOString(),
      prompt: '',
      delivery_mode: 'direct',
      delivery_target: channelId,
    });
    const eta = formatReminderEta(when);
    return `✅ Rappel #${job.id} ${eta} : ${message}`;
  }

  private mentionRegex(): RegExp {
    const escaped = this.mm.botUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`@${escaped}\\b`, 'gi');
  }
}

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) { chunks.push(remaining); break; }
    let splitIdx = remaining.lastIndexOf('\n', maxLen);
    if (splitIdx < maxLen * 0.5) splitIdx = remaining.lastIndexOf(' ', maxLen);
    if (splitIdx < maxLen * 0.3) splitIdx = maxLen;
    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).trimStart();
  }
  return chunks;
}
