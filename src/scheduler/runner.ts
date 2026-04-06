/**
 * Runner : vérifie les jobs dus et les exécute via claude CLI.
 * Appelé périodiquement par systemd timer ou cron.
 */
import { spawn } from 'child_process';
import { SchedulerStore, type ScheduledJob } from './store.js';
import { notifyMattermost, type NotifyConfig } from './notify.js';
import { PROJECT_ROOT } from './db.js';

export interface RunnerConfig {
  claudePath: string;
  timeout: number;  // ms par job
  projectDir: string;
  notify?: NotifyConfig;
}

const DEFAULT_CONFIG: RunnerConfig = {
  claudePath: process.env.CLAUDE_PATH ?? 'claude',
  timeout: 300_000,  // 5 min
  projectDir: PROJECT_ROOT,
};

/** Exécute un job via claude CLI. */
async function executeJob(
  job: ScheduledJob,
  store: SchedulerStore,
  config: RunnerConfig,
): Promise<void> {
  // delivery_mode 'direct' : envoie le message directement sans invoquer Claude
  if (job.delivery_mode === 'direct') {
    await executeDirectJob(job, store, config);
    return;
  }

  const execId = store.startExecution(job.id);
  const startTime = Date.now();
  const cwd = job.project_dir || config.projectDir;

  console.log(`[runner] Exécution job "${job.name}" (id=${job.id})`);

  try {
    const { exitCode, stdout, stderr } = await spawnClaude(job.prompt, cwd, config);
    const durationMs = Date.now() - startTime;

    store.finishExecution(execId, job.id, exitCode ?? 1, stdout, stderr, durationMs);
    console.log(`[runner] Job "${job.name}" terminé (exit=${exitCode}, ${durationMs}ms)`);

    // Envoyer notification si delivery_mode === 'announce'
    if (job.delivery_mode === 'announce' && job.delivery_target && config.notify) {
      const summary = stdout.trim().slice(0, 4000) || '(pas de sortie)';
      const message = `**[${job.name}]** ${exitCode === 0 ? '✓' : '✗'} (${Math.round(durationMs / 1000)}s)\n\n${summary}`;
      await notifyMattermost(config.notify, job.delivery_target, message).catch((err) => {
        console.error(`[runner] Notification failed for "${job.name}":`, err);
      });
    }
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const message = (err as Error).message;
    store.finishExecution(execId, job.id, 1, '', message, durationMs);
    console.error(`[runner] Job "${job.name}" échoué: ${message}`);
  }
}

/**
 * Exécute un job en mode direct : envoie `description` directement sur le canal cible,
 * sans invoquer Claude. Utilisé pour les rappels utilisateur (`!remind`).
 */
async function executeDirectJob(
  job: ScheduledJob,
  store: SchedulerStore,
  config: RunnerConfig,
): Promise<void> {
  const execId = store.startExecution(job.id);
  const startTime = Date.now();

  console.log(`[runner] Rappel direct "${job.name}" (id=${job.id})`);

  try {
    if (!job.delivery_target || !config.notify) {
      throw new Error('delivery_target ou notify manquant pour un job direct');
    }

    const message = `⏰ **Rappel** : ${job.description}`;
    await notifyMattermost(config.notify, job.delivery_target, message);

    const durationMs = Date.now() - startTime;
    store.finishExecution(execId, job.id, 0, message, '', durationMs);
    console.log(`[runner] Rappel "${job.name}" envoyé (${durationMs}ms)`);
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errMsg = (err as Error).message;
    store.finishExecution(execId, job.id, 1, '', errMsg, durationMs);
    console.error(`[runner] Rappel "${job.name}" échoué: ${errMsg}`);
  }
}

function spawnClaude(
  prompt: string,
  cwd: string,
  config: RunnerConfig,
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(config.claudePath, [
      '--print',
      '--output-format', 'text',
      prompt,
    ], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: config.timeout,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => resolve({ exitCode: code, stdout, stderr }));
  });
}

/** Point d'entrée principal : vérifie et exécute les jobs dus. */
export async function runDueJobs(
  store: SchedulerStore,
  config: Partial<RunnerConfig> = {},
): Promise<number> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const dueJobs = store.dueJobs();

  if (dueJobs.length === 0) {
    return 0;
  }

  console.log(`[runner] ${dueJobs.length} job(s) à exécuter`);

  // Exécuter séquentiellement pour éviter de surcharger
  for (const job of dueJobs) {
    await executeJob(job, store, cfg);
  }

  return dueJobs.length;
}
