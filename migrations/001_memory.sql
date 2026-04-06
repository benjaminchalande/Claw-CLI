-- Schéma mémoire Yutoclaw-Claude
-- Inspiré de yutoclaw (internal/memory/store.go) mais simplifié.
-- 3 zones : internal (agent), external (public), user (par utilisateur)

CREATE TABLE IF NOT EXISTS memory_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zone TEXT NOT NULL CHECK(zone IN ('internal', 'external', 'user')),
  user_id TEXT DEFAULT '',       -- vide sauf pour zone 'user'
  theme TEXT NOT NULL DEFAULT '', -- catégorie/thème libre
  name TEXT NOT NULL,             -- identifiant unique dans zone/user/theme
  content TEXT NOT NULL,
  importance INTEGER NOT NULL DEFAULT 1 CHECK(importance BETWEEN 1 AND 3),
  -- 1=info, 2=correction/important, 3=critique
  source TEXT NOT NULL DEFAULT 'explicit',
  -- 'explicit', 'auto', 'introspection', 'consolidation'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(zone, user_id, theme, name)
);

-- Index pour les requêtes courantes
CREATE INDEX IF NOT EXISTS idx_memory_zone ON memory_entries(zone);
CREATE INDEX IF NOT EXISTS idx_memory_zone_theme ON memory_entries(zone, theme);
CREATE INDEX IF NOT EXISTS idx_memory_importance ON memory_entries(importance DESC);
CREATE INDEX IF NOT EXISTS idx_memory_updated ON memory_entries(updated_at DESC);

-- Recherche plein texte via FTS5
CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
  name,
  content,
  content='memory_entries',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

-- Triggers pour synchroniser FTS5 avec la table principale
CREATE TRIGGER IF NOT EXISTS memory_fts_insert AFTER INSERT ON memory_entries BEGIN
  INSERT INTO memory_fts(rowid, name, content) VALUES (new.id, new.name, new.content);
END;

CREATE TRIGGER IF NOT EXISTS memory_fts_delete AFTER DELETE ON memory_entries BEGIN
  INSERT INTO memory_fts(memory_fts, rowid, name, content) VALUES ('delete', old.id, old.name, old.content);
END;

CREATE TRIGGER IF NOT EXISTS memory_fts_update AFTER UPDATE ON memory_entries BEGIN
  INSERT INTO memory_fts(memory_fts, rowid, name, content) VALUES ('delete', old.id, old.name, old.content);
  INSERT INTO memory_fts(rowid, name, content) VALUES (new.id, new.name, new.content);
END;
