# P11 — Reminders & Refonte Scheduler

Deux axes : consolider la DB scheduler dans memory.db, puis ajouter les reminders par langage naturel.

## Décisions d'architecture (mémoire 2026-04-06)

- Fusionner `scheduled_jobs` + `job_executions` dans `memory.db` → supprimer `scheduler.db`
- Scheduler loop déjà intégrée dans bridge.ts (setInterval 60s) → pas de changement
- Reminders : mode `delivery_mode: 'reminder'` qui skip Claude et envoie le texte directement
- Parsing naturel : "rappelle-moi de X dans 2h", "à 14h30", "demain à 9h"

## Tâches

- [x] **T62** — Migrer scheduler tables dans memory.db (`005_scheduler.sql`, update `init.ts`)
- [x] **T63** — Parser reminders naturels (`src/bridge/commands/reminderParser.ts`)
- [x] **T64** — Mode `direct` dans le runner (skip Claude, envoi direct)
- [x] **T65** — Intégration bridge : détecter reminders, créer jobs, commandes `!reminders` / `!annuler <id>`
- [x] **T66** — Tests (25 tests parser, 14 tests commandRouter, 225 tests total)

## Patterns supportés (T63)

```
rappelle-moi (de) <message> dans <N> (seconde(s)|minute(s)|heure(s)|jour(s))
rappelle-moi (de) <message> à <HH:MM> (aujourd'hui implicite, tomorrow si passé)
rappelle-moi (de) <message> demain à <HH:MM>
```

## Schema ajout (T62)

`delivery_mode` étendu à `'silent' | 'announce' | 'reminder'`

Pour le mode `reminder` :
- `prompt` contient le texte du rappel
- Le runner skip Claude et envoie `prompt` directement à `delivery_target`
- Le job passe à `completed` après l'envoi

## Commandes (T65)

- `!reminders` — liste les reminders actifs (subset de `!schedule list`)
- `!annuler <id>` — annule un reminder par ID
- Messages naturels détectés → job créé silencieusement, confirmation dans le channel
