# P3 — Autonomie

Donner à Claude Code la capacité d'agir de manière proactive : tâches planifiées, veille, mise à jour automatique de la feuille de route.

## Contexte

Yutoclaw a un système de jobs planifiés (cron, interval, once) avec des cycles d'introspection (T1/T2/T3). On reproduit cela avec des mécanismes plus légers adaptés à Claude Code.

## Tâches

- [x] **T18** — Système de tâches planifiées (cron qui invoque `claude` avec un prompt)
- [x] **T19** — Job d'introspection : résumé de session, consolidation mémoire → `src/introspection/`
- [x] **T20** — Notifications proactives sur Mattermost (rappels, alertes, rapports) → `src/scheduler/notify.ts`
- [x] **T21** — Feuille de route vivante : roadmap-sync job + ROADMAP_SYNC_PROMPT
- [x] **T22** — Tests (73 au total) et documentation
