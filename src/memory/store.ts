import type Database from 'better-sqlite3';

export type Zone = 'internal' | 'external' | 'user';
export type Source = 'explicit' | 'auto' | 'introspection' | 'consolidation';

export interface MemoryEntry {
  id: number;
  zone: Zone;
  user_id: string;
  theme: string;
  name: string;
  content: string;
  importance: number;
  source: Source;
  created_at: string;
  updated_at: string;
}

export interface WriteOptions {
  zone: Zone;
  name: string;
  content: string;
  user_id?: string;
  theme?: string;
  importance?: number;
  source?: Source;
}

export interface SearchResult {
  entry: MemoryEntry;
  rank: number;
  score: number; // Combined tri-factor score
}

export class MemoryStore {
  constructor(private db: Database.Database) {}

  write(opts: WriteOptions): MemoryEntry {
    const { zone, name, content } = opts;
    const user_id = opts.user_id ?? '';
    const theme = opts.theme ?? '';
    const importance = opts.importance ?? 1;
    const source = opts.source ?? 'explicit';

    this.db.prepare(`
      INSERT INTO memory_entries (zone, user_id, theme, name, content, importance, source, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(zone, user_id, theme, name)
      DO UPDATE SET content = excluded.content,
                    importance = excluded.importance,
                    source = excluded.source,
                    updated_at = datetime('now')
    `).run(zone, user_id, theme, name, content, importance, source);

    return this.read(zone, name, user_id, theme)!;
  }

  read(zone: Zone, name: string, user_id = '', theme = ''): MemoryEntry | null {
    return this.db.prepare(`
      SELECT * FROM memory_entries
      WHERE zone = ? AND user_id = ? AND theme = ? AND name = ?
    `).get(zone, user_id, theme, name) as MemoryEntry | null ?? null;
  }

  readById(id: number): MemoryEntry | null {
    return this.db.prepare('SELECT * FROM memory_entries WHERE id = ?')
      .get(id) as MemoryEntry | null ?? null;
  }

  append(opts: WriteOptions): MemoryEntry {
    const { zone, name, content } = opts;
    const user_id = opts.user_id ?? '';
    const theme = opts.theme ?? '';
    const importance = opts.importance ?? 1;
    const source = opts.source ?? 'explicit';

    this.db.prepare(`
      INSERT INTO memory_entries (zone, user_id, theme, name, content, importance, source, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(zone, user_id, theme, name)
      DO UPDATE SET content = memory_entries.content || char(10) || excluded.content,
                    importance = MAX(memory_entries.importance, excluded.importance),
                    updated_at = datetime('now')
    `).run(zone, user_id, theme, name, content, importance, source);

    return this.read(zone, name, user_id, theme)!;
  }

  delete(zone: Zone, name: string, user_id = '', theme = ''): boolean {
    const result = this.db.prepare(`
      DELETE FROM memory_entries
      WHERE zone = ? AND user_id = ? AND theme = ? AND name = ?
    `).run(zone, user_id, theme, name);

    return result.changes > 0;
  }

  list(zone: Zone, user_id = '', theme = ''): MemoryEntry[] {
    return this.db.prepare(`
      SELECT * FROM memory_entries
      WHERE zone = ? AND user_id = ? AND theme = ?
      ORDER BY importance DESC, updated_at DESC
    `).all(zone, user_id, theme) as MemoryEntry[];
  }

  listAll(zone?: Zone): MemoryEntry[] {
    if (zone) {
      return this.db.prepare(`
        SELECT * FROM memory_entries WHERE zone = ?
        ORDER BY zone, theme, importance DESC, updated_at DESC
      `).all(zone) as MemoryEntry[];
    }
    return this.db.prepare(`
      SELECT * FROM memory_entries
      ORDER BY zone, theme, importance DESC, updated_at DESC
    `).all() as MemoryEntry[];
  }

  listThemes(zone: Zone, user_id = ''): string[] {
    const rows = this.db.prepare(`
      SELECT DISTINCT theme FROM memory_entries
      WHERE zone = ? AND user_id = ? AND theme != ''
      ORDER BY theme
    `).all(zone, user_id) as { theme: string }[];

    return rows.map(r => r.theme);
  }

  /**
   * Full-text search with tri-factor scoring:
   * - relevance: FTS5 rank
   * - recency: days since last update (decays)
   * - importance: weight 1-3
   */
  search(query: string, opts?: { zone?: Zone; limit?: number }): SearchResult[] {
    const limit = opts?.limit ?? 20;

    let sql = `
      SELECT me.*, fts.rank as fts_rank
      FROM memory_fts fts
      JOIN memory_entries me ON me.id = fts.rowid
      WHERE memory_fts MATCH ?
    `;
    const params: (string | number)[] = [query];

    if (opts?.zone) {
      sql += ' AND me.zone = ?';
      params.push(opts.zone);
    }

    sql += ' ORDER BY fts.rank LIMIT ?';
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as (MemoryEntry & { fts_rank: number })[];

    return rows.map(row => {
      const { fts_rank, ...entry } = row;
      // Tri-factor scoring
      const relevance = -fts_rank; // FTS5 rank is negative (lower = better)
      const daysSinceUpdate = (Date.now() - new Date(entry.updated_at).getTime()) / 86_400_000;
      const recency = Math.max(0, 1 - daysSinceUpdate / 365); // Decay over 1 year
      const importance = entry.importance / 3;
      const score = relevance * 0.5 + recency * 0.3 + importance * 0.2;

      return { entry, rank: fts_rank, score };
    }).sort((a, b) => b.score - a.score);
  }

  count(zone?: Zone): number {
    if (zone) {
      return (this.db.prepare('SELECT COUNT(*) as c FROM memory_entries WHERE zone = ?')
        .get(zone) as { c: number }).c;
    }
    return (this.db.prepare('SELECT COUNT(*) as c FROM memory_entries')
      .get() as { c: number }).c;
  }
}
