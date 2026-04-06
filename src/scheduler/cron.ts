/**
 * Utilitaires de parsing pour les schedules : cron, interval, once.
 * Inspiré de yutoclaw/internal/jobs/cron_parser.go
 */
import { CronExpressionParser } from 'cron-parser';

export type ScheduleType = 'cron' | 'interval' | 'once';

const DURATION_RE = /^(\d+)(s|m|h|d)$/;

const DURATION_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** Parse une durée style Go ("30m", "1h", "6h", "1d") en millisecondes. */
export function parseDuration(value: string): number {
  const match = value.match(DURATION_RE);
  if (!match) throw new Error(`Durée invalide: "${value}" (ex: 30m, 1h, 6h)`);
  return parseInt(match[1]) * DURATION_MS[match[2]];
}

/** Calcule le prochain run pour un schedule donné. */
export function computeNextRun(
  type: ScheduleType,
  value: string,
  fromDate: Date = new Date(),
): Date | null {
  switch (type) {
    case 'cron': {
      const interval = CronExpressionParser.parse(value, { currentDate: fromDate, tz: 'UTC' });
      return interval.next().toDate();
    }
    case 'interval': {
      const ms = parseDuration(value);
      return new Date(fromDate.getTime() + ms);
    }
    case 'once': {
      const date = new Date(value);
      if (isNaN(date.getTime())) throw new Error(`Date invalide: "${value}"`);
      // Si la date est passée, pas de prochain run
      return date > fromDate ? date : null;
    }
    default:
      throw new Error(`Type de schedule inconnu: "${type}"`);
  }
}

/** Vérifie qu'un schedule est valide sans lancer d'exception non gérée. */
export function validateSchedule(type: ScheduleType, value: string): string | null {
  try {
    switch (type) {
      case 'cron':
        CronExpressionParser.parse(value);
        break;
      case 'interval':
        parseDuration(value);
        break;
      case 'once': {
        const d = new Date(value);
        if (isNaN(d.getTime())) return `Date invalide: "${value}"`;
        break;
      }
      default:
        return `Type inconnu: "${type}"`;
    }
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}
