# P9 — Refonte Bridge & Planification

Deux axes : finir de nettoyer le bridge + ajouter un système de planification (epics/tasks).

## A. Refonte Bridge

### Fait
- [x] **T46** — System prompt séparé (`--system-prompt-file` + `--append-system-prompt` + modèle sonnet)
- [x] **T47** — ~~Sessions par channel~~ → Invalidé (`--session-id` incompatible avec `--print`). Historique injecté dans `--append-system-prompt`.

### À faire
- [x] **T48** — ~~Fallback-model~~ → N/A (Claude uniquement, pas de fallback pertinent)
- [x] **T49** — Décomposer Bridge.ts : init extrait dans `src/bridge/init.ts`
- [x] **T50** — Tests E2E validés avec la nouvelle archi (7 tests E2E passent)

## B. Planification (Epics & Tasks)

Inspiré de yutoclaw : suivi de travail persistant entre conversations.

- [x] **T51** — Modèle Epic en SQLite → `src/planning/store.ts`
- [x] **T52** — Modèle Task lié aux Epics → `src/planning/store.ts` + CLI `src/planning/cli.ts`
- [x] **T53** — Injection des tâches actives dans le prompt bridge (`activeSummary()`)
- [x] **T54** — Tests planification (15 tests : CRUD epics, tasks, summary)
