/**
 * Store SQLite pour les tâches planifiées.
 * Inspiré de yutoclaw/internal/jobs/job_store.go
 */
import type Database from 'better-sqlite3';
import { type ScheduleType, computeNextRun, validateSchedule } from './cron.js';

export type JobStatus = 'active' | 'paused' | 'completed' | 'failed';
export type DeliveryMode = 'announce' | 'silent' | 'direct';

export interface ScheduledJob {
  id: number;
  name: string;
  description: string;
  schedule_type: ScheduleType;
  schedule_value: string;
  prompt: string;
  project_dir: string;
  delivery_mode: DeliveryMode;
  delivery_target: string;
  status: JobStatus;
  next_run_at: string | null;
  last_run_at: string | null;
  last_result: string | null;
  failure_count: number;
  max_failures: number;
  created_at: string;
  updated_at: string;
}

export interface CreateJobOptions {
  name: string;
  description?: string;
  schedule_type: ScheduleType;
  schedule_value: string;
  prompt: string;
  project_dir?: string;
  delivery_mode?: DeliveryMode;
  delivery_target?: string;
  max_failures?: number;
}

export interface JobExecution {
  id: number;
  job_id: number;
  started_at: string;
  finished_at: string | null;
  exit_code: number | null;
  stdout: string | null;
  stderr: string | null;
  duration_ms: number | null;
}

export class SchedulerStore {
  constructor(private db: Database.Database) {}

  create(opts: CreateJobOptions): ScheduledJob {
    const error = validateSchedule(opts.schedule_type, opts.schedule_value);
    if (error) throw new Error(`Schedule invalide: ${error}`);

    const nextRun = computeNextRun(opts.schedule_type, opts.schedule_value);

    this.db.prepare(`
      INSERT INTO scheduled_jobs (name, description, schedule_type, schedule_value, prompt,
        project_dir, delivery_mode, delivery_target, max_failures, next_run_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      opts.name,
      opts.description ?? '',
      opts.schedule_type,
      opts.schedule_value,
      opts.prompt,
      opts.project_dir ?? '',
      opts.delivery_mode ?? 'silent',
      opts.delivery_target ?? '',
      opts.max_failures ?? 3,
      nextRun ? nextRun.toISOString() : null,
    );

    return this.getByName(opts.name)!;
  }

  getById(id: number): ScheduledJob | null {
    return this.db.prepare('SELECT * FROM scheduled_jobs WHERE id = ?')
      .get(id) as ScheduledJob | null ?? null;
  }

  getByName(name: string): ScheduledJob | null {
    return this.db.prepare('SELECT * FROM scheduled_jobs WHERE name = ?')
      .get(name) as ScheduledJob | null ?? null;
  }

  list(status?: JobStatus): ScheduledJob[] {
    if (status) {
      return this.db.prepare('SELECT * FROM scheduled_jobs WHERE status = ? ORDER BY next_run_at')
        .all(status) as ScheduledJob[];
    }
    return this.db.prepare('SELECT * FROM scheduled_jobs ORDER BY status, next_run_at')
      .all() as ScheduledJob[];
  }

  /** Retourne les jobs actifs dont next_run_at <= now. */
  dueJobs(now: Date = new Date()): ScheduledJob[] {
    return this.db.prepare(`
      SELECT * FROM scheduled_jobs
      WHERE status = 'active' AND next_run_at IS NOT NULL AND next_run_at <= ?
      ORDER BY next_run_at
    `).all(now.toISOString()) as ScheduledJob[];
  }

  pause(nameOrId: string | number): boolean {
    const job = typeof nameOrId === 'number' ? this.getById(nameOrId) : this.getByName(nameOrId);
    if (!job || job.status !== 'active') return false;
    this.db.prepare("UPDATE scheduled_jobs SET status = 'paused', updated_at = datetime('now') WHERE id = ?")
      .run(job.id);
    return true;
  }

  resume(nameOrId: string | number): boolean {
    const job = typeof nameOrId === 'number' ? this.getById(nameOrId) : this.getByName(nameOrId);
    if (!job || job.status !== 'paused') return false;

    const nextRun = computeNextRun(job.schedule_type, job.schedule_value);
    this.db.prepare(`
      UPDATE scheduled_jobs SET status = 'active', next_run_at = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(nextRun ? nextRun.toISOString() : null, job.id);
    return true;
  }

  delete(nameOrId: string | number): boolean {
    const job = typeof nameOrId === 'number' ? this.getById(nameOrId) : this.getByName(nameOrId);
    if (!job) return false;
    this.db.prepare('DELETE FROM scheduled_jobs WHERE id = ?').run(job.id);
    return true;
  }

  /** Enregistre le début d'une exécution. Retourne l'ID d'exécution. */
  startExecution(jobId: number): number {
    const result = this.db.prepare(
      "INSERT INTO job_executions (job_id, started_at) VALUES (?, datetime('now'))"
    ).run(jobId);
    return Number(result.lastInsertRowid);
  }

  /** Enregistre la fin d'une exécution et met à jour le job. */
  finishExecution(
    executionId: number,
    jobId: number,
    exitCode: number,
    stdout: string,
    stderr: string,
    durationMs: number,
  ): void {
    const truncatedStdout = stdout.slice(0, 10_000);
    const truncatedStderr = stderr.slice(0, 5_000);
    const truncatedResult = stdout.slice(0, 2_000);

    // Mettre à jour l'exécution
    this.db.prepare(`
      UPDATE job_executions
      SET finished_at = datetime('now'), exit_code = ?, stdout = ?, stderr = ?, duration_ms = ?
      WHERE id = ?
    `).run(exitCode, truncatedStdout, truncatedStderr, durationMs, executionId);

    const job = this.getById(jobId);
    if (!job) return;

    if (exitCode === 0) {
      // once → toujours compléter après exécution réussie
      if (job.schedule_type === 'once') {
        this.db.prepare(`
          UPDATE scheduled_jobs
          SET last_run_at = datetime('now'), last_result = ?, failure_count = 0,
              next_run_at = NULL, status = 'completed', updated_at = datetime('now')
          WHERE id = ?
        `).run(truncatedResult, jobId);
      } else {
        const nextRun = computeNextRun(job.schedule_type, job.schedule_value);
        const newStatus = nextRun ? 'active' : 'completed';
        this.db.prepare(`
          UPDATE scheduled_jobs
          SET last_run_at = datetime('now'), last_result = ?, failure_count = 0,
              next_run_at = ?, status = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(truncatedResult, nextRun ? nextRun.toISOString() : null, newStatus, jobId);
      }
    } else {
      // Échec : incrémenter le compteur
      const newFailures = job.failure_count + 1;
      const newStatus = newFailures >= job.max_failures ? 'failed' : 'active';
      const nextRun = newStatus === 'active'
        ? computeNextRun(job.schedule_type, job.schedule_value)
        : null;
      this.db.prepare(`
        UPDATE scheduled_jobs
        SET last_run_at = datetime('now'), last_result = ?, failure_count = ?,
            next_run_at = ?, status = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(truncatedResult, newFailures, nextRun ? nextRun.toISOString() : null, newStatus, jobId);
    }
  }

  /** Historique d'exécution d'un job. */
  executions(jobId: number, limit = 10): JobExecution[] {
    return this.db.prepare(`
      SELECT * FROM job_executions WHERE job_id = ? ORDER BY started_at DESC LIMIT ?
    `).all(jobId, limit) as JobExecution[];
  }

  /** Nombre total de jobs. */
  count(status?: JobStatus): number {
    if (status) {
      return (this.db.prepare('SELECT COUNT(*) as c FROM scheduled_jobs WHERE status = ?')
        .get(status) as { c: number }).c;
    }
    return (this.db.prepare('SELECT COUNT(*) as c FROM scheduled_jobs')
      .get() as { c: number }).c;
  }

  /**
   * Résumé des jobs actifs à injecter dans le contexte du prompt.
   * Retourne une chaîne vide si aucun job actif.
   */
  activeSummary(): string {
    const jobs = this.list('active');
    if (jobs.length === 0) return '';

    const lines = jobs.map((job) => {
      const nextRun = job.next_run_at
        ? `dans ${formatRelativeTime(new Date(job.next_run_at))}`
        : 'en attente';
      const label = job.delivery_mode === 'direct'
        ? `⏰ Rappel #${job.id} : "${job.description.slice(0, 60)}"`
        : `🔄 Job #${job.id} "${job.name}" (${job.schedule_type}: ${job.schedule_value.slice(0, 30)})`;
      return `- ${label} — ${nextRun}`;
    });

    return `Jobs planifiés actifs :\n${lines.join('\n')}`;
  }
}

/** Formate une date future en durée relative ("2h30", "5min", "3j"). */
function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const diffMs = date.getTime() - now.getTime();
  if (diffMs <= 0) return 'maintenant';
  const diffS = Math.round(diffMs / 1000);
  if (diffS < 60) return `${diffS}s`;
  const diffM = Math.round(diffS / 60);
  if (diffM < 60) return `${diffM}min`;
  const diffH = Math.round(diffM / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.round(diffH / 24);
  return `${diffD}j`;
}
