/**
 * Routing des commandes directes (!schedule, !remind, etc.) avant le fallback LLM.
 * Ces commandes sont réservées à l'admin et court-circuitent le LLM.
 */
import { type SchedulerStore, type ScheduledJob } from '../../scheduler/store.js';
import { validateSchedule, parseDuration } from '../../scheduler/cron.js';
import type { ScheduleType } from '../../scheduler/cron.js';
import { runDueJobs } from '../../scheduler/runner.js';

export function isAdminUser(userId: string): boolean {
  // Read at call time so env changes (e.g. in tests) take effect
  const adminId = process.env.MATTERMOST_ADMIN_USER_ID ?? process.env.MM_OWNER_USER_ID ?? '';
  return adminId !== '' && userId === adminId;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScheduleSubCommand =
  | { sub: 'list' }
  | { sub: 'add'; cron: string; prompt: string }
  | { sub: 'pause'; id: number }
  | { sub: 'resume'; id: number }
  | { sub: 'remove'; id: number }
  | { sub: 'run'; id: number };

export type ScheduleCommand = { type: 'schedule' } & ScheduleSubCommand;

export type RemindCommand = {
  type: 'remind';
  delay: string;   // durée brute : "2h", "30m", "1d"
  message: string;
};

export type RemindersListCommand = { type: 'reminders-list' };
export type ReminderCancelCommand = { type: 'reminder-cancel'; id: number };

export type DirectCommand = ScheduleCommand | RemindCommand | RemindersListCommand | ReminderCancelCommand;

// ─── Parsers ──────────────────────────────────────────────────────────────────

/**
 * Parse une commande directe (`!schedule`, `!remind`, `!reminders`, `!annuler`).
 * Retourne null si le texte ne commence par aucun préfixe connu.
 * Lève ParseError si la syntaxe est invalide.
 */
export function parseCommand(text: string): DirectCommand | null {
  const trimmed = text.trim();
  if (trimmed.startsWith('!reminders')) return { type: 'reminders-list' };
  if (/^!annuler\b/i.test(trimmed)) return parseAnnulerCommand(trimmed);
  if (trimmed.startsWith('!remind')) return parseRemindCommand(trimmed);
  if (trimmed.startsWith('!schedule')) return parseScheduleCommand(trimmed);
  return null;
}

/** Parse `!annuler <id>`. */
function parseAnnulerCommand(text: string): ReminderCancelCommand {
  const m = text.match(/^!annuler\s+(\d+)$/i);
  if (!m) {
    throw new ParseError('❌ Usage : `!annuler <id>`\nExemple : `!annuler 3`');
  }
  const id = parseInt(m[1]);
  if (isNaN(id) || id <= 0) {
    throw new ParseError('❌ ID invalide. Usage : `!annuler <id>`');
  }
  return { type: 'reminder-cancel', id };
}

/**
 * Parse une commande `!schedule ...`.
 * Retourne null si le texte ne commence pas par `!schedule`.
 */
export function parseScheduleCommand(text: string): ScheduleCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('!schedule')) return null;

  const rest = trimmed.slice('!schedule'.length).trim();

  if (!rest || rest === 'help') {
    throw new ParseError(
      '❌ Usage :\n' +
      '```\n' +
      '!schedule list\n' +
      '!schedule add <cron> "<prompt>"\n' +
      '!schedule pause <id>\n' +
      '!schedule resume <id>\n' +
      '!schedule remove <id>\n' +
      '!schedule run <id>\n' +
      '```',
    );
  }

  const parts = rest.split(/\s+/);
  const sub = parts[0].toLowerCase();

  switch (sub) {
    case 'list':
      return { type: 'schedule', sub: 'list' };

    case 'add': {
      const afterAdd = rest.slice('add'.length).trim();
      return parseAddCommand(afterAdd);
    }

    case 'pause':
    case 'resume':
    case 'remove':
    case 'run': {
      const id = parseInt(parts[1]);
      if (isNaN(id) || id <= 0) {
        throw new ParseError(`❌ Usage : \`!schedule ${sub} <id>\` (id doit être un entier positif)`);
      }
      return { type: 'schedule', sub, id };
    }

    default:
      throw new ParseError(
        `❌ Sous-commande inconnue : \`${sub}\`. Commandes valides : list, add, pause, resume, remove, run`,
      );
  }
}

/**
 * Parse `!remind <délai> <message>`.
 * Délai : "2h", "30m", "1d", "45s"
 * Message : tout ce qui suit le délai.
 */
export function parseRemindCommand(text: string): RemindCommand {
  const trimmed = text.trim();
  if (!trimmed.startsWith('!remind')) {
    throw new ParseError('❌ Commande invalide.');
  }

  const rest = trimmed.slice('!remind'.length).trim();

  if (!rest) {
    throw new ParseError(
      '❌ Usage : `!remind <délai> <message>`\n' +
      'Exemples :\n' +
      '  `!remind 2h réunion avec Paul`\n' +
      '  `!remind 30m checker les logs`\n' +
      '  `!remind 1d backup hebdomadaire`',
    );
  }

  // Premier mot = délai, le reste = message
  const spaceIdx = rest.search(/\s/);
  if (spaceIdx === -1) {
    throw new ParseError(
      '❌ Message manquant.\n' +
      'Usage : `!remind <délai> <message>`\n' +
      'Exemple : `!remind 2h réunion avec Paul`',
    );
  }

  const delay = rest.slice(0, spaceIdx).trim();
  const message = rest.slice(spaceIdx).trim();

  if (!message) {
    throw new ParseError('❌ Le message du rappel ne peut pas être vide.');
  }

  // Valider le délai
  try {
    parseDuration(delay);
  } catch {
    throw new ParseError(
      `❌ Délai invalide : \`${delay}\`\n` +
      'Formats acceptés : `30s`, `10m`, `2h`, `1d`',
    );
  }

  return { type: 'remind', delay, message };
}

/**
 * Parse la partie "add" : `<cron> "<prompt>"`.
 */
function parseAddCommand(text: string): ScheduleCommand {
  const promptMatch = text.match(/^(.*?)"((?:[^"\\]|\\.)+)"\s*$/s);
  if (!promptMatch) {
    throw new ParseError(
      '❌ Usage : `!schedule add <cron> "<prompt>"`\n' +
      'Exemple : `!schedule add "0 9 * * 1-5" "Résume les emails du jour"`',
    );
  }

  const cronPart = promptMatch[1].trim().replace(/^"|"$/g, '').trim();
  const promptPart = promptMatch[2].replace(/\\"/g, '"');

  if (!cronPart) {
    throw new ParseError(
      '❌ Expression cron manquante.\n' +
      'Exemple : `!schedule add "0 9 * * 1-5" "Résume les emails du jour"`',
    );
  }
  if (!promptPart.trim()) {
    throw new ParseError('❌ Le prompt ne peut pas être vide.');
  }

  const scheduleType = detectScheduleType(cronPart);
  const validationError = validateSchedule(scheduleType, cronPart);
  if (validationError) {
    throw new ParseError(`❌ Expression invalide : ${validationError}`);
  }

  return { type: 'schedule', sub: 'add', cron: cronPart, prompt: promptPart };
}

/** Détecte le type de schedule depuis la valeur. */
function detectScheduleType(value: string): ScheduleType {
  if (/^\d+(s|m|h|d)$/.test(value)) return 'interval';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'once';
  return 'cron';
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export interface HandleScheduleOptions {
  store: SchedulerStore;
  claudePath?: string;
  projectDir?: string;
  claudeTimeout?: number;
  /** ID du canal Mattermost d'où provient la commande (pour les rappels). */
  channelId?: string;
}

/**
 * Exécute une commande directe (schedule, remind, reminders, annuler) et retourne le message.
 */
export async function handleCommand(
  command: DirectCommand,
  options: HandleScheduleOptions,
): Promise<string> {
  if (command.type === 'remind') {
    return handleRemind(options.store, command.delay, command.message, options.channelId);
  }
  if (command.type === 'reminders-list') {
    return handleRemindersList(options.store);
  }
  if (command.type === 'reminder-cancel') {
    return handleReminderCancel(options.store, command.id);
  }
  return handleScheduleCommand(command, options);
}

/**
 * Exécute une commande schedule et retourne le message à envoyer en Mattermost.
 */
export async function handleScheduleCommand(
  command: ScheduleCommand,
  options: HandleScheduleOptions,
): Promise<string> {
  const { store } = options;

  switch (command.sub) {
    case 'list':
      return handleList(store);

    case 'add':
      return handleAdd(store, command.cron, command.prompt);

    case 'pause':
      return handlePause(store, command.id);

    case 'resume':
      return handleResume(store, command.id);

    case 'remove':
      return handleRemove(store, command.id);

    case 'run':
      return handleRun(store, command.id, options);
  }
}

function handleList(store: SchedulerStore): string {
  const jobs = store.list();
  if (jobs.length === 0) return 'Aucun job planifié.';

  const lines = ['| ID | Nom | Schedule | Statut | Prochain run |', '|----|-----|----------|--------|--------------|'];
  for (const job of jobs) {
    const nextRun = job.next_run_at
      ? new Date(job.next_run_at).toLocaleString('fr-FR', { timeZone: 'UTC' }) + ' UTC'
      : '—';
    const scheduleDisplay = job.schedule_value.length > 20
      ? job.schedule_value.slice(0, 20) + '…'
      : job.schedule_value;
    lines.push(`| ${job.id} | ${job.name} | \`${scheduleDisplay}\` | ${statusEmoji(job.status)} ${job.status} | ${nextRun} |`);
  }
  return lines.join('\n');
}

function handleAdd(store: SchedulerStore, cron: string, prompt: string): string {
  const scheduleType = detectScheduleType(cron);
  const name = `cmd-${Date.now()}`;

  const job = store.create({
    name,
    description: prompt.slice(0, 100),
    schedule_type: scheduleType,
    schedule_value: cron,
    prompt,
    delivery_mode: 'silent',
  });

  return `✅ Job #${job.id} créé : \`${cron}\` — \`${prompt.slice(0, 80)}${prompt.length > 80 ? '…' : ''}\``;
}

function handlePause(store: SchedulerStore, id: number): string {
  const job = store.getById(id);
  if (!job) return `❌ Job #${id} introuvable.`;
  if (job.status !== 'active') return `❌ Job #${id} n'est pas actif (statut : ${job.status}).`;
  store.pause(id);
  return `✅ Job #${id} mis en pause.`;
}

function handleResume(store: SchedulerStore, id: number): string {
  const job = store.getById(id);
  if (!job) return `❌ Job #${id} introuvable.`;
  if (job.status !== 'paused') return `❌ Job #${id} n'est pas en pause (statut : ${job.status}).`;
  store.resume(id);
  return `✅ Job #${id} réactivé.`;
}

function handleRemove(store: SchedulerStore, id: number): string {
  const job = store.getById(id);
  if (!job) return `❌ Job #${id} introuvable.`;
  store.delete(id);
  return `✅ Job #${id} supprimé.`;
}

async function handleRun(
  store: SchedulerStore,
  id: number,
  options: HandleScheduleOptions,
): Promise<string> {
  const job = store.getById(id);
  if (!job) return `❌ Job #${id} introuvable.`;

  // Forcer le next_run_at à maintenant pour que runDueJobs le prenne
  store['db'].prepare(
    "UPDATE scheduled_jobs SET next_run_at = datetime('now'), status = 'active' WHERE id = ?",
  ).run(id);

  await runDueJobs(store, {
    claudePath: options.claudePath,
    timeout: options.claudeTimeout,
    projectDir: options.projectDir,
  });

  return `✅ Job #${id} exécuté.`;
}

/** Liste les rappels actifs (delivery_mode === 'direct'). */
function handleRemindersList(store: SchedulerStore): string {
  const jobs = store.list('active').filter(j => j.delivery_mode === 'direct');
  if (jobs.length === 0) return 'Aucun rappel actif.';

  const lines = ['**Rappels actifs :**'];
  for (const job of jobs) {
    const when = job.next_run_at
      ? new Date(job.next_run_at).toLocaleString('fr-FR', {
          timeZone: 'UTC', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
        }) + ' UTC'
      : '?';
    lines.push(`• #${job.id} — ${job.description} (à ${when})`);
  }
  return lines.join('\n');
}

/** Annule un rappel par ID. */
function handleReminderCancel(store: SchedulerStore, id: number): string {
  const job = store.getById(id);
  if (!job) return `❌ Rappel #${id} introuvable.`;
  if (job.delivery_mode !== 'direct') {
    return `❌ #${id} n'est pas un rappel (c'est un job planifié — utilise \`!schedule remove ${id}\`).`;
  }
  if (job.status !== 'active') {
    return `❌ Rappel #${id} n'est plus actif (statut : ${job.status}).`;
  }
  store.delete(id);
  return `✅ Rappel #${id} annulé.`;
}

/**
 * Crée un rappel one-shot qui sera envoyé directement dans le channel d'origine.
 */
function handleRemind(
  store: SchedulerStore,
  delay: string,
  message: string,
  channelId?: string,
): string {
  if (!channelId) {
    return '❌ Impossible de créer un rappel : channel inconnu.';
  }

  // Calculer la date cible = maintenant + délai
  const durationMs = parseDuration(delay);
  const targetDate = new Date(Date.now() + durationMs);
  const isoDate = targetDate.toISOString();

  const name = `remind-${Date.now()}`;

  const job = store.create({
    name,
    description: message,
    schedule_type: 'once',
    schedule_value: isoDate,
    prompt: '',           // non utilisé en mode direct
    delivery_mode: 'direct',
    delivery_target: channelId,
  });

  // Formater le délai lisiblement
  const delayLabel = formatDelay(durationMs);
  const timeStr = targetDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';

  return `✅ Rappel #${job.id} dans **${delayLabel}** (à ${timeStr}) : ${message}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusEmoji(status: string): string {
  switch (status) {
    case 'active': return '🟢';
    case 'paused': return '⏸';
    case 'completed': return '✅';
    case 'failed': return '❌';
    default: return '❓';
  }
}

function formatDelay(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d}j`;
}

/** Erreur de parsing avec message utilisateur. */
export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}
