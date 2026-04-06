# P2 — Bridge Mattermost

Créer un serveur léger qui connecte Mattermost à Claude Code CLI, permettant de recevoir des instructions et d'y répondre.

## Contexte

Yutoclaw se connecte à Mattermost via WebSocket (REST API v4) et route les messages vers son orchestrateur. Ici, le bridge :
1. Se connecte au WebSocket Mattermost
2. Écoute les messages dans les channels/DMs autorisés
3. Invoque `claude` CLI avec le message comme prompt
4. Capture la sortie et la poste en réponse sur Mattermost

## Tâches

- [x] **T10** — Initialiser le projet Node.js/TypeScript (package.json, tsconfig)
- [x] **T11** — Implémenter le client Mattermost (WebSocket + REST) → `src/bridge/mattermost.ts`
- [x] **T12** — Implémenter l'invocation Claude Code CLI (spawn process) → `src/bridge/claude.ts`
- [x] **T13** — Implémenter le routage message → claude → réponse → `src/bridge/bridge.ts`
- [x] **T14** — Gestion de la configuration (env vars) → `src/bridge/config.ts` + `.env.example`
- [x] **T15** — Gestion des threads (réponses dans le thread MM d'origine)
- [x] **T16** — Tests (26 au total) → `src/bridge/__tests__/bridge.test.ts`
- [x] **T17** — Systemd unit → `scripts/yutoclaw-bridge.service`

## Usage

```bash
# Copier et remplir la config
cp .env.example .env
# Lancer le bridge
npm run bridge
```
