# Feuille de route Claw CLI

## Vision

Faire de Claude Code un agent autonome persistant, capable de :
- Recevoir des instructions via Mattermost (comme Yutoclaw le fait)
- Maintenir une mémoire structurée entre les sessions
- Gérer une feuille de route et travailler dessus en autonomie
- Agir proactivement (tâches planifiées, veille, etc.)

L'idée : Claude Code EST l'agent. Le Go de Yutoclaw est remplacé par Claude Code + un bridge léger.

## Phases

### Infrastructure (fait)
1. **P0 — Fondations** (`01-p0-fondations.md`) — Structure projet, CLAUDE.md, skill /go-claudeclaw, roadmap ✓
2. **P1 — Mémoire structurée** (`02-p1-memoire.md`) — Système de mémoire avancé, zones, recherche ✓
3. **P2 — Bridge Mattermost** (`03-p2-mattermost.md`) — Serveur bridge MM → Claude Code CLI, réponses ✓
4. **P3 — Autonomie** (`04-p3-autonomie.md`) — Tâches planifiées, actions proactives, feuille de route vivante ✓
5. **P4 — Stabilisation** (`05-p4-stabilisation.md`) — Historique conversation, systemd timer, tests intégration

### Émulation Yutoclaw (fait)
6. **P5 — Personnalité** (`06-p5-personnalite.md`) — Prompt layeré soul/mind/personality, anti-patterns
7. **P6 — Contexte** (`07-p6-contexte.md`) — Injection mémoire, profils utilisateur, outils en conversation
8. **P7 — Conversation** (`08-p7-conversation.md`) — Threads, réactions, vigilance, discipline d'exécution
9. **P8 — Apprentissage** (`09-p8-apprentissage.md`) — Mémorisation auto, adaptation, évolution personnalité

## Dépendances utilisateur

- [x] Token bot Mattermost → configuré dans .env
- [x] URL du serveur Mattermost → configured in .env
- [x] Channel(s) ou DM autorisé(s) → DM activé

## État

Dernière mise à jour : 2026-04-06
**P0 → P11 complétés.** (T61 doc setup WA reste quand le numéro est fourni)

225 tests passent (15 suites).

## Capacités actuelles

- **Personnalité layerée** : soul (valeurs) → mind (discipline) → personality (ton) assemblés dynamiquement
- **Mémoire FTS5** : 3 zones (internal/external/user), recherche plein texte, injection dans chaque conversation
- **Profils utilisateur** : auto-créés, compteur de messages, injection dans le prompt
- **Historique persisté** : SQLite, survit au restart, 20 derniers messages par channel
- **Outils** : activés pour le owner (Read, Grep, Glob, Bash, WebSearch)
- **Sécurité** : hard block par user ID (seul le owner), dedup synchrone, regex escaping
- **Typing indicator** : via WebSocket pendant que Claude réfléchit
- **Planification** : Epics & Tasks persistants en SQLite, summary injecté dans le prompt
- **Réponses directes** : toujours dans le channel, jamais en sous-thread
- **Apprentissage** : mémorisation silencieuse, mode teaching, adaptation au style
- **Rappels** : `!remind 2h message` ou "rappelle-moi de X dans 2h" → rappel direct dans le channel
- **Scheduler unifié** : memory.db (plus de scheduler.db séparé), résumé injecté dans le prompt

## Infrastructure opérationnelle

```bash
npm run bridge          # Lance le bridge Mattermost (DM @claw-cli)
npm run memory          # CLI mémoire (write/read/search/list/delete)
npx tsx src/scheduler/cli.ts list   # Voir les jobs planifiés
npx tsx src/scheduler/cli.ts run    # Exécuter les jobs dus
npx tsx src/introspection/setup.ts  # Enregistrer les jobs d'introspection
```

## Tâches par phase

| Phase | Tâches | État |
|-------|--------|------|
| P0 Fondations | T01-T04 | ✓ |
| P1 Mémoire | T05-T09 | ✓ |
| P2 Bridge | T10-T17 | ✓ |
| P3 Autonomie | T18-T22 | ✓ |
| P4 Stabilisation | T23-T26 | ✓ |
| P5 Personnalité | T27-T30 | ✓ |
| P6 Contexte | T31-T35 | ✓ |
| P7 Conversation | T36-T40 | ✓ |
| P8 Apprentissage | T41-T45 | ✓ |
| P9 Refonte & Planification | T46-T54 | ✓ |
| P10 WhatsApp | T55-T61 | T55-T60 ✓, T61 (doc) en attente numéro |
| P11 Scheduling naturel | T62-T66 | ✓ |
