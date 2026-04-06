-- Historique de conversation persisté.
-- Remplace le buffer en mémoire (perdu au restart du bridge).

CREATE TABLE IF NOT EXISTS conversation_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  sender TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp INTEGER NOT NULL,  -- epoch ms
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_conv_channel ON conversation_messages(channel_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_conv_timestamp ON conversation_messages(timestamp DESC);
