#!/bin/bash
# Hook Claude Code "Stop" — sauvegarde les échanges CLI dans la BDD Claw CLI.
# Reçoit en stdin un JSON avec transcript_path et session_id.
set -e

INPUT=$(cat)
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
STOP_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')

# Prevent infinite loops
if [ "$STOP_ACTIVE" = "true" ]; then exit 0; fi
if [ -z "$TRANSCRIPT_PATH" ] || [ ! -f "$TRANSCRIPT_PATH" ]; then exit 0; fi

# Find the Claw CLI data directory (relative to this script)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DB_PATH="$SCRIPT_DIR/../../data/memory.db"

if [ ! -f "$DB_PATH" ]; then exit 0; fi

# Ensure the conversation_messages table exists (with platform column)
sqlite3 "$DB_PATH" "CREATE TABLE IF NOT EXISTS conversation_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id TEXT NOT NULL,
  role TEXT NOT NULL,
  sender TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  platform TEXT NOT NULL DEFAULT 'unknown'
);" 2>/dev/null || true

# Extract last user message and last assistant message from transcript
# Transcript is JSONL — each line is a turn
LAST_USER=$(tac "$TRANSCRIPT_PATH" | jq -r 'select(.role == "user") | .content[0].text // empty' 2>/dev/null | head -1)
LAST_ASSISTANT=$(tac "$TRANSCRIPT_PATH" | jq -r 'select(.role == "assistant") | .content[] | select(.type == "text") | .text // empty' 2>/dev/null | head -1)

NOW_MS=$(date +%s%3N 2>/dev/null || echo $(( $(date +%s) * 1000 )))
CHANNEL="cli:$SESSION_ID"

# Only log if we have content
if [ -n "$LAST_USER" ]; then
  ESCAPED_USER=$(echo "$LAST_USER" | head -c 5000 | sed "s/'/''/g")
  sqlite3 "$DB_PATH" "INSERT OR IGNORE INTO conversation_messages (channel_id, role, sender, content, timestamp, platform)
    VALUES ('$CHANNEL', 'user', 'owner', '$ESCAPED_USER', $NOW_MS, 'cli');" 2>/dev/null || true
fi

if [ -n "$LAST_ASSISTANT" ]; then
  ESCAPED_ASST=$(echo "$LAST_ASSISTANT" | head -c 5000 | sed "s/'/''/g")
  sqlite3 "$DB_PATH" "INSERT OR IGNORE INTO conversation_messages (channel_id, role, sender, content, timestamp, platform)
    VALUES ('$CHANNEL', 'assistant', 'claw-cli', '$ESCAPED_ASST', $NOW_MS, 'cli');" 2>/dev/null || true
fi

exit 0
