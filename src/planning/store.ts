/**
 * Epic & Task store — persistent work tracking across conversations.
 * Inspired by yutoclaw/internal/work/epic_store.go
 */
import type Database from 'better-sqlite3';

export type EpicStatus = 'draft' | 'active' | 'completed' | 'cancelled';
export type EpicPriority = 'P1' | 'P2' | 'P3';
export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'failed' | 'blocked' | 'cancelled';

export interface Epic {
  id: number;
  title: string;
  description: string;
  status: EpicStatus;
  priority: EpicPriority;
  success_criteria: string;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: number;
  epic_id: number | null;
  title: string;
  description: string;
  status: TaskStatus;
  result: string;
  created_at: string;
  updated_at: string;
}

export class PlanningStore {
  constructor(private db: Database.Database) {}

  // --- Epics ---

  createEpic(title: string, opts?: {
    description?: string;
    priority?: EpicPriority;
    status?: EpicStatus;
    success_criteria?: string;
    source?: string;
  }): Epic {
    this.db.prepare(`
      INSERT INTO epics (title, description, priority, status, success_criteria, source)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      title,
      opts?.description ?? '',
      opts?.priority ?? 'P2',
      opts?.status ?? 'active',
      opts?.success_criteria ?? '',
      opts?.source ?? 'owner',
    );

    return this.db.prepare('SELECT * FROM epics WHERE id = last_insert_rowid()').get() as Epic;
  }

  getEpic(id: number): Epic | null {
    return this.db.prepare('SELECT * FROM epics WHERE id = ?').get(id) as Epic | null ?? null;
  }

  listEpics(opts?: { status?: EpicStatus; all?: boolean }): Epic[] {
    if (opts?.status) {
      return this.db.prepare('SELECT * FROM epics WHERE status = ? ORDER BY priority, created_at DESC')
        .all(opts.status) as Epic[];
    }
    if (opts?.all) {
      return this.db.prepare('SELECT * FROM epics ORDER BY priority, created_at DESC').all() as Epic[];
    }
    // Default: non-terminal epics
    return this.db.prepare(
      "SELECT * FROM epics WHERE status NOT IN ('completed', 'cancelled') ORDER BY priority, created_at DESC"
    ).all() as Epic[];
  }

  updateEpic(id: number, patch: Partial<Pick<Epic, 'title' | 'description' | 'status' | 'priority' | 'success_criteria'>>): boolean {
    const sets: string[] = ["updated_at = datetime('now')"];
    const args: unknown[] = [];

    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) {
        sets.push(`${key} = ?`);
        args.push(value);
      }
    }

    args.push(id);
    const result = this.db.prepare(`UPDATE epics SET ${sets.join(', ')} WHERE id = ?`).run(...args);
    return result.changes > 0;
  }

  // --- Tasks ---

  createTask(title: string, opts?: {
    epic_id?: number;
    description?: string;
    status?: TaskStatus;
  }): Task {
    this.db.prepare(`
      INSERT INTO tasks (title, epic_id, description, status)
      VALUES (?, ?, ?, ?)
    `).run(
      title,
      opts?.epic_id ?? null,
      opts?.description ?? '',
      opts?.status ?? 'pending',
    );

    return this.db.prepare('SELECT * FROM tasks WHERE id = last_insert_rowid()').get() as Task;
  }

  getTask(id: number): Task | null {
    return this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | null ?? null;
  }

  listTasks(opts?: { epic_id?: number; status?: TaskStatus }): Task[] {
    if (opts?.epic_id && opts?.status) {
      return this.db.prepare('SELECT * FROM tasks WHERE epic_id = ? AND status = ? ORDER BY id')
        .all(opts.epic_id, opts.status) as Task[];
    }
    if (opts?.epic_id) {
      return this.db.prepare('SELECT * FROM tasks WHERE epic_id = ? ORDER BY id')
        .all(opts.epic_id) as Task[];
    }
    if (opts?.status) {
      return this.db.prepare('SELECT * FROM tasks WHERE status = ? ORDER BY id')
        .all(opts.status) as Task[];
    }
    return this.db.prepare("SELECT * FROM tasks WHERE status NOT IN ('done', 'cancelled') ORDER BY id")
      .all() as Task[];
  }

  updateTask(id: number, patch: Partial<Pick<Task, 'title' | 'description' | 'status' | 'result' | 'epic_id'>>): boolean {
    const sets: string[] = ["updated_at = datetime('now')"];
    const args: unknown[] = [];

    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) {
        sets.push(`${key} = ?`);
        args.push(value);
      }
    }

    args.push(id);
    const result = this.db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...args);
    return result.changes > 0;
  }

  // --- Summary (for prompt injection) ---

  /** Returns a markdown summary of active epics and their pending tasks. */
  activeSummary(): string {
    const epics = this.listEpics();
    if (epics.length === 0) return '';

    const lines: string[] = ['Travail en cours :'];
    for (const epic of epics) {
      const tasks = this.listTasks({ epic_id: epic.id });
      const done = tasks.filter(t => t.status === 'done').length;
      lines.push(`- [${epic.priority}] ${epic.title} (${done}/${tasks.length} tâches)`);
      for (const task of tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled')) {
        const icon = task.status === 'in_progress' ? '→' : '○';
        lines.push(`  ${icon} ${task.title}`);
      }
    }

    return lines.join('\n');
  }
}
