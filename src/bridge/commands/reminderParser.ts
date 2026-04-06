/**
 * Parser de reminders en langage naturel.
 *
 * Patterns supportés :
 *   rappelle-moi (de) <message> dans <N> (s|m|h|j|seconde(s)|minute(s)|heure(s)|jour(s))
 *   rappelle-moi (de) <message> à <HH:MM> [aujourd'hui implicite, demain si passé]
 *   rappelle-moi (de) <message> demain à <HH:MM>
 *   rappelle-moi (de) <message> dans <N> heure(s) et <M> minute(s)
 *
 * Toutes les heures sont en UTC (cohérent avec la DB et les tests).
 * Retourne null si le message ne ressemble pas à un reminder.
 */

export interface ParsedReminder {
  /** Texte du rappel (ce qui sera affiché). */
  message: string;
  /** Quand envoyer le rappel (UTC). */
  when: Date;
}

// Regex de base : commence par "rappelle-moi" (optionnellement "de/d'")
const REMIND_PREFIX = /^rappelle[-\s]?moi\s+(?:de\s+|d[''])?/i;

/**
 * Parse un message pour détecter un reminder.
 * Retourne null si le message ne correspond à aucun pattern.
 */
export function parseReminderMessage(text: string, now = new Date()): ParsedReminder | null {
  const trimmed = text.trim();
  if (!REMIND_PREFIX.test(trimmed)) return null;

  // Essayer chaque pattern dans l'ordre
  return (
    parseWithin(trimmed, now) ??
    parseDemainAt(trimmed, now) ??
    parseAt(trimmed, now) ??
    null
  );
}

// ─── Pattern : "dans N (s|m|h|j|secondes|minutes|heures|jours)" ──────────────

// Unités : abréviations et formes longues
const UNIT_RE = 's|m|h|j|seconde?s?|sec(?:ondes?)?|minutes?|min(?:utes?)?|heures?|hrs?|jours?';
const WITHIN_RE = new RegExp(
  `^(.+?)\\s+dans\\s+(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_RE})\\s*(?:et\\s+(\\d+)\\s*(${UNIT_RE}))?$`,
  'i',
);

function parseWithin(text: string, now: Date): ParsedReminder | null {
  const body = text.replace(REMIND_PREFIX, '').trim();
  const m = WITHIN_RE.exec(body);
  if (!m) return null;

  const [, messagePart, numStr, unit, extraNumStr, extraUnit] = m;
  const num = parseFloat(numStr.replace(',', '.'));

  const ms = toMs(num, unit);
  if (ms === null) return null;

  let totalMs = ms;
  if (extraNumStr && extraUnit) {
    const extraMs = toMs(parseInt(extraNumStr), extraUnit);
    if (extraMs !== null) totalMs += extraMs;
  }

  const when = new Date(now.getTime() + totalMs);
  return { message: messagePart.trim(), when };
}

// ─── Pattern : "demain à HH:MM" ──────────────────────────────────────────────

const DEMAIN_AT_RE = /^(.+?)\s+demain\s+à\s+(\d{1,2})h?(?::?(\d{2}))?$/i;

function parseDemainAt(text: string, now: Date): ParsedReminder | null {
  const body = text.replace(REMIND_PREFIX, '').trim();
  const m = DEMAIN_AT_RE.exec(body);
  if (!m) return null;

  const [, messagePart, hourStr, minStr = '00'] = m;
  const hour = parseInt(hourStr);
  const min = parseInt(minStr);
  if (hour > 23 || min > 59) return null;

  // "Demain" = date UTC + 1 jour, à l'heure UTC spécifiée
  const when = new Date(now);
  when.setUTCDate(when.getUTCDate() + 1);
  when.setUTCHours(hour, min, 0, 0);

  return { message: messagePart.trim(), when };
}

// ─── Pattern : "à HH:MM" (aujourd'hui UTC, ou demain si passé) ───────────────

const AT_RE = /^(.+?)\s+à\s+(\d{1,2})h?(?::?(\d{2}))?$/i;

function parseAt(text: string, now: Date): ParsedReminder | null {
  const body = text.replace(REMIND_PREFIX, '').trim();
  const m = AT_RE.exec(body);
  if (!m) return null;

  const [, messagePart, hourStr, minStr = '00'] = m;
  const hour = parseInt(hourStr);
  const min = parseInt(minStr);
  if (hour > 23 || min > 59) return null;

  const when = new Date(now);
  when.setUTCHours(hour, min, 0, 0);

  // Si l'heure UTC est déjà passée, reporter à demain
  if (when <= now) {
    when.setUTCDate(when.getUTCDate() + 1);
  }

  return { message: messagePart.trim(), when };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toMs(num: number, unit: string): number | null {
  const u = unit.toLowerCase();
  // secondes : s, sec, seconde(s)
  if (u === 's' || /^sec(?:onde)?s?$/.test(u)) return num * 1_000;
  // minutes : m, min, minute(s)
  if (u === 'm' || /^min(?:ute)?s?$/.test(u)) return num * 60_000;
  // heures : h, hr, heure(s)
  if (u === 'h' || /^h(?:r|eure)?s?$/.test(u)) return num * 3_600_000;
  // jours : j, jour(s)
  if (u === 'j' || /^jour?s?$/.test(u)) return num * 86_400_000;
  return null;
}

/** Formate une date pour l'affichage UTC (ex: "dans 2h (12:00)"). */
export function formatReminderEta(when: Date, now = new Date()): string {
  const diffMs = when.getTime() - now.getTime();
  if (diffMs <= 0) return 'maintenant';

  const totalSec = Math.round(diffMs / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}min`);
  if (parts.length === 0 && seconds > 0) parts.push(`${seconds}s`);

  const hh = String(when.getUTCHours()).padStart(2, '0');
  const mm = String(when.getUTCMinutes()).padStart(2, '0');

  // "demain" si la date UTC est différente
  const whenDay = when.toISOString().slice(0, 10);
  const nowDay = now.toISOString().slice(0, 10);
  const isTomorrow = whenDay > nowDay;

  return `dans ${parts.join(' ')} (${isTomorrow ? 'demain ' : ''}${hh}:${mm})`;
}
