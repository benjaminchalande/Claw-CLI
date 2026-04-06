# P1 — Mémoire structurée

Doter Claude Code d'une mémoire plus riche que l'auto-memory par défaut, inspirée du système de Yutoclaw (zones, importance, recherche hybride).

## Contexte

Yutoclaw a 3 zones mémoire :
- **ZoneInternal** — Connaissances privées (décisions, stratégie, patterns d'erreur)
- **ZoneExternal** — Connaissances publiques (FAQ, procédures)
- **ZoneUser** — Données par utilisateur (préférences, expertise, historique)

Pour Claude Code, on adapte ce concept en fichiers markdown + une base SQLite pour la recherche.

## Tâches

- [x] **T05** — Concevoir le schéma mémoire (zones, métadonnées, format fichier) → voir `design-memoire.md` + `migrations/001_memory.sql`
- [x] **T06** — Implémenter le store mémoire SQLite (CRUD, recherche FTS5) → `src/memory/store.ts`
- [x] **T07** — Créer un script CLI `memory` pour lire/écrire/chercher en mémoire → `src/memory/cli.ts`
- [x] **T08** — Intégrer la mémoire dans la skill `/go-claudeclaw` (injection contexte)
- [x] **T09** — Tests (21 tests) → `src/memory/__tests__/store.test.ts`
