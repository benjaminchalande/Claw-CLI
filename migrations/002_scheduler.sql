-- Schéma scheduler Yutoclaw-Claude
-- Inspiré de yutoclaw (internal/jobs/job_store.go) : cron, interval, once

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  schedule_type TEXT NOT NULL CHECK(schedule_type IN ('cron', 'interval', 'once')),
  schedule_value TEXT NOT NULL,    -- cron expr, durée (ex: "30m"), ou ISO datetime
  prompt TEXT NOT NULL,             -- prompt envoyé à claude CLI
  project_dir TEXT DEFAULT '',      -- répertoire de travail (défaut: racine projet)
  delivery_mode TEXT NOT NULL DEFAULT 'silent' CHECK(delivery_mode IN ('announce', 'silent')),
  delivery_target TEXT DEFAULT '',  -- channel/user Mattermost pour notification
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'paused', 'completed', 'failed')),
  next_run_at TEXT,                 -- ISO datetime prochaine exécution
  last_run_at TEXT,                 -- ISO datetime dernière exécution
  last_result TEXT,                 -- résultat dernière exécution (tronqué)
  failure_count INTEGER DEFAULT 0,
  max_failures INTEGER DEFAULT 3,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON scheduled_jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_next_run ON scheduled_jobs(next_run_at);

CREATE TABLE IF NOT EXISTS job_executions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES scheduled_jobs(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  exit_code INTEGER,
  stdout TEXT,
  stderr TEXT,
  duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_executions_job ON job_executions(job_id);
CREATE INDEX IF NOT EXISTS idx_executions_started ON job_executions(started_at DESC);
