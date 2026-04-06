# Claw CLI

An autonomous AI agent built on [Claude Code](https://claude.ai/claude-code). Claw CLI connects to your messaging platforms (Mattermost, WhatsApp) and acts as a persistent, intelligent assistant with memory, personality, and planning capabilities.

## What it does

- **Talks to you** on Mattermost and WhatsApp
- **Remembers** across sessions (SQLite + FTS5 full-text search)
- **Has a personality** (layered prompt system: soul, mind, personality)
- **Plans work** (epics & tasks, injected into every conversation)
- **Runs scheduled jobs** (introspection, reminders, roadmap sync)
- **Learns** from conversations (auto-memorization, user profiles, teaching mode)

## Quick setup

**Prerequisites:** Node.js 22+, Claude Code CLI installed and authenticated.

```bash
git clone <this-repo> claw-cli
cd claw-cli
npm install
```

Then open Claude Code in this directory and ask it to set things up:

```bash
claude
```

Tell Claude:

> Read readme-for-claude.md and help me set up Claw CLI

Claude will guide you through configuration interactively.

## Manual setup

If you prefer to configure manually:

```bash
cp .env.example .env
# Edit .env with your Mattermost URL, bot token, and user ID
npm run bridge
```

## Architecture

```
Mattermost / WhatsApp
        ↓ WebSocket
   Bridge (Node.js/TS)
   - Prompt builder (soul + mind + personality)
   - Memory injection (FTS5 search)
   - User profiles
   - Planning summary
        ↓ stdin/stdout
   Claude Code CLI (--print --system-prompt-file)
        ↓
   Response → Messaging platform
```

## Commands

```bash
npm run bridge        # Start Mattermost bridge
npm run bridge:wa     # Start WhatsApp bridge
npm run memory        # Memory CLI (write/read/search/list)
npm run planning      # Planning CLI (epic/task create/list)
npm run scheduler     # Scheduler CLI (jobs list/run)
```

## License

MIT
