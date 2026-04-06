import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SchedulerStore, type CreateJobOptions } from '../store.js';
import { computeNextRun, parseDuration, validateSchedule } from '../cron.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION = readFileSync(join(__dirname, '..', '..', '..', 'migrations', '002_scheduler.sql'), 'utf-8');

let db: Database.Database;
let store: SchedulerStore;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(MIGRATION);
  store = new SchedulerStore(db);
});

afterEach(() => {
  db.close();
});

// --- cron.ts ---

describe('parseDuration', () => {
  it('parse les durées valides', () => {
    expect(parseDuration('30m')).toBe(30 * 60_000);
    expect(parseDuration('1h')).toBe(3_600_000);
    expect(parseDuration('6h')).toBe(6 * 3_600_000);
    expect(parseDuration('1d')).toBe(86_400_000);
    expect(parseDuration('10s')).toBe(10_000);
  });

  it('rejette les durées invalides', () => {
    expect(() => parseDuration('')).toThrow();
    expect(() => parseDuration('abc')).toThrow();
    expect(() => parseDuration('30')).toThrow();
    expect(() => parseDuration('30x')).toThrow();
  });
});

describe('validateSchedule', () => {
  it('valide les cron expressions', () => {
    expect(validateSchedule('cron', '0 3 * * *')).toBeNull();
    expect(validateSchedule('cron', '*/5 * * * *')).toBeNull();
  });

  it('rejette les cron invalides', () => {
    expect(validateSchedule('cron', 'not a cron')).not.toBeNull();
  });

  it('valide les intervalles', () => {
    expect(validateSchedule('interval', '30m')).toBeNull();
    expect(validateSchedule('interval', '1h')).toBeNull();
  });

  it('rejette les intervalles invalides', () => {
    expect(validateSchedule('interval', 'abc')).not.toBeNull();
  });

  it('valide les dates once', () => {
    expect(validateSchedule('once', '2030-01-01T00:00:00Z')).toBeNull();
  });

  it('rejette les dates once invalides', () => {
    expect(validateSchedule('once', 'not a date')).not.toBeNull();
  });

  it('rejette les types inconnus', () => {
    expect(validateSchedule('unknown' as any, 'x')).not.toBeNull();
  });
});

describe('computeNextRun', () => {
  const ref = new Date('2026-04-05T12:00:00Z');

  it('calcule le prochain run cron', () => {
    const next = computeNextRun('cron', '0 3 * * *', ref);
    expect(next).not.toBeNull();
    expect(next! > ref).toBe(true);
    // Le prochain run est dans les 24h
    expect(next!.getTime() - ref.getTime()).toBeLessThanOrEqual(86_400_000);
  });

  it('calcule le prochain run interval', () => {
    const next = computeNextRun('interval', '1h', ref);
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBe(ref.getTime() + 3_600_000);
  });

  it('retourne la date once si future', () => {
    const future = '2030-01-01T00:00:00Z';
    const next = computeNextRun('once', future, ref);
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBe(new Date(future).getTime());
  });

  it('retourne null pour once passée', () => {
    const past = '2020-01-01T00:00:00Z';
    const next = computeNextRun('once', past, ref);
    expect(next).toBeNull();
  });
});

// --- store.ts ---

describe('SchedulerStore', () => {
  const baseJob: CreateJobOptions = {
    name: 'test-job',
    schedule_type: 'interval',
    schedule_value: '1h',
    prompt: 'Fais un résumé',
  };

  describe('create', () => {
    it('crée un job avec les valeurs par défaut', () => {
      const job = store.create(baseJob);
      expect(job.name).toBe('test-job');
      expect(job.schedule_type).toBe('interval');
      expect(job.schedule_value).toBe('1h');
      expect(job.prompt).toBe('Fais un résumé');
      expect(job.status).toBe('active');
      expect(job.delivery_mode).toBe('silent');
      expect(job.failure_count).toBe(0);
      expect(job.next_run_at).not.toBeNull();
    });

    it('crée un job avec options complètes', () => {
      const job = store.create({
        ...baseJob,
        name: 'full-job',
        description: 'Un job complet',
        delivery_mode: 'announce',
        delivery_target: 'channel-id',
        max_failures: 5,
      });
      expect(job.description).toBe('Un job complet');
      expect(job.delivery_mode).toBe('announce');
      expect(job.delivery_target).toBe('channel-id');
      expect(job.max_failures).toBe(5);
    });

    it('rejette les noms dupliqués', () => {
      store.create(baseJob);
      expect(() => store.create(baseJob)).toThrow();
    });

    it('rejette les schedules invalides', () => {
      expect(() => store.create({ ...baseJob, name: 'bad', schedule_value: 'xyz' })).toThrow(/invalide/);
    });
  });

  describe('getById / getByName', () => {
    it('retrouve un job par id et par nom', () => {
      const created = store.create(baseJob);
      expect(store.getById(created.id)).not.toBeNull();
      expect(store.getById(created.id)!.name).toBe('test-job');
      expect(store.getByName('test-job')).not.toBeNull();
      expect(store.getByName('test-job')!.id).toBe(created.id);
    });

    it('retourne null pour id/nom inexistant', () => {
      expect(store.getById(999)).toBeNull();
      expect(store.getByName('nope')).toBeNull();
    });
  });

  describe('list', () => {
    it('liste tous les jobs', () => {
      store.create({ ...baseJob, name: 'a' });
      store.create({ ...baseJob, name: 'b' });
      expect(store.list()).toHaveLength(2);
    });

    it('filtre par status', () => {
      store.create({ ...baseJob, name: 'a' });
      store.create({ ...baseJob, name: 'b' });
      store.pause('b');
      expect(store.list('active')).toHaveLength(1);
      expect(store.list('paused')).toHaveLength(1);
    });
  });

  describe('pause / resume', () => {
    it('pause et reprend un job', () => {
      store.create(baseJob);
      expect(store.pause('test-job')).toBe(true);
      expect(store.getByName('test-job')!.status).toBe('paused');
      expect(store.resume('test-job')).toBe(true);
      expect(store.getByName('test-job')!.status).toBe('active');
    });

    it('pause retourne false si déjà en pause', () => {
      store.create(baseJob);
      store.pause('test-job');
      expect(store.pause('test-job')).toBe(false);
    });

    it('resume retourne false si pas en pause', () => {
      store.create(baseJob);
      expect(store.resume('test-job')).toBe(false);
    });

    it('retourne false pour job inexistant', () => {
      expect(store.pause('nope')).toBe(false);
      expect(store.resume('nope')).toBe(false);
    });
  });

  describe('delete', () => {
    it('supprime un job', () => {
      store.create(baseJob);
      expect(store.delete('test-job')).toBe(true);
      expect(store.getByName('test-job')).toBeNull();
    });

    it('retourne false si inexistant', () => {
      expect(store.delete('nope')).toBe(false);
    });
  });

  describe('dueJobs', () => {
    it('retourne les jobs dont next_run_at est passé', () => {
      store.create(baseJob);
      // Le job a un next_run_at dans 1h, donc pas dû maintenant
      expect(store.dueJobs()).toHaveLength(0);

      // Forcer next_run_at dans le passé
      db.prepare("UPDATE scheduled_jobs SET next_run_at = '2020-01-01T00:00:00Z'").run();
      expect(store.dueJobs()).toHaveLength(1);
    });

    it('ignore les jobs en pause', () => {
      store.create(baseJob);
      db.prepare("UPDATE scheduled_jobs SET next_run_at = '2020-01-01T00:00:00Z'").run();
      store.pause('test-job');
      expect(store.dueJobs()).toHaveLength(0);
    });
  });

  describe('executions', () => {
    it('enregistre et consulte les exécutions', () => {
      const job = store.create(baseJob);
      const execId = store.startExecution(job.id);
      expect(execId).toBeGreaterThan(0);

      store.finishExecution(execId, job.id, 0, 'output here', '', 1500);

      const execs = store.executions(job.id);
      expect(execs).toHaveLength(1);
      expect(execs[0].exit_code).toBe(0);
      expect(execs[0].stdout).toBe('output here');
      expect(execs[0].duration_ms).toBe(1500);

      // Job mis à jour
      const updated = store.getById(job.id)!;
      expect(updated.last_run_at).not.toBeNull();
      expect(updated.failure_count).toBe(0);
    });

    it('gère les échecs et le compteur', () => {
      const job = store.create({ ...baseJob, max_failures: 2 });
      const e1 = store.startExecution(job.id);
      store.finishExecution(e1, job.id, 1, '', 'error', 100);

      let updated = store.getById(job.id)!;
      expect(updated.failure_count).toBe(1);
      expect(updated.status).toBe('active');

      const e2 = store.startExecution(job.id);
      store.finishExecution(e2, job.id, 1, '', 'error again', 100);

      updated = store.getById(job.id)!;
      expect(updated.failure_count).toBe(2);
      expect(updated.status).toBe('failed');
    });

    it('complète un job once après succès (date passée)', () => {
      const job = store.create({
        ...baseJob,
        name: 'once-job',
        schedule_type: 'once',
        schedule_value: '2020-01-01T00:00:00Z',
      });

      // Le job once avec date passée n'a pas de next_run, forçons-le
      db.prepare("UPDATE scheduled_jobs SET next_run_at = '2020-01-01T00:00:00Z', status = 'active'").run();

      const execId = store.startExecution(job.id);
      store.finishExecution(execId, job.id, 0, 'done', '', 50);

      const updated = store.getById(job.id)!;
      // once job with past date → completed (no next run)
      expect(updated.status).toBe('completed');
      expect(updated.next_run_at).toBeNull();
    });
  });

  describe('count', () => {
    it('compte les jobs', () => {
      expect(store.count()).toBe(0);
      store.create({ ...baseJob, name: 'a' });
      store.create({ ...baseJob, name: 'b' });
      expect(store.count()).toBe(2);
      expect(store.count('active')).toBe(2);
      store.pause('a');
      expect(store.count('active')).toBe(1);
      expect(store.count('paused')).toBe(1);
    });
  });
});
