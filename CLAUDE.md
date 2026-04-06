# Claw CLI

Autonomous AI agent built on Claude Code. Connects to messaging platforms (Mattermost, WhatsApp) with persistent memory, personality, and planning.

## Setup

New user? Read `readme-for-claude.md` — it contains step-by-step instructions for Claude to guide the setup interactively.

## Architecture

Claude Code IS the agent. Around it:
- **Bridges** — Mattermost (WebSocket) and WhatsApp (Baileys) connect to `claude --print`
- **Memory** — SQLite + FTS5, 3 zones (internal/external/user)
- **Planning** — Epics & Tasks in SQLite, summary injected in prompts
- **Prompts** — Layered: soul.md → mind.md → personality.md
- **Scheduler** — Cron/interval/once jobs with introspection cycles

## Development

- Node.js / TypeScript
- `npm test` — run all tests
- `npm run bridge` — start Mattermost bridge
- `npm run bridge:wa` — start WhatsApp bridge
- Commits in French, atomic
- `/go-claudeclaw` skill for autonomous development sessions

## Key files

- `src/bridge/` — Mattermost bridge
- `src/bridges/whatsapp/` — WhatsApp bridge
- `src/memory/` — Memory store + CLI
- `src/planning/` — Epics & Tasks
- `src/scheduler/` — Job scheduler
- `src/introspection/` — Introspection prompts
- `docs/roadmap/` — Development roadmap
