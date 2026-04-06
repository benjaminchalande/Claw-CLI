# P11 — Scheduling naturel & Initiative

Passer de chatbot à collègue autonome. Deux axes :
1. **Rappels utilisateur** — créer un rappel depuis le chat (`!remind 2h réunion avec Paul`)
2. **Contexte scheduler** — Claude sait quels jobs sont actifs et peut en parler

## Architecture

```
!remind <délai> <message>
    → bridge.ts (routing direct)
    → commandRouter.ts (parse délai, crée job once + delivery direct)
    → scheduler loop (toutes les 60s)
    → runner.ts (delivery_mode: 'direct' → envoie le message directement)
    → Mattermost (le rappel arrive dans le channel d'origine)

scheduler.activeSummary()
    → injecté dans le contexte dynamique de Claude
    → Claude sait quels rappels sont actifs
```

## Tâches

- [x] **T62** — Roadmap P11 (ce fichier)
- [x] **T63** — `delivery_mode: 'direct'` dans runner.ts — envoie `description` directement sans invoquer Claude
- [x] **T64** — Commande `!remind <délai> <message>` — crée un job once delivery_mode=direct, delivery_target=channel courant
- [x] **T65** — `scheduler.activeSummary()` injecté dans le contexte dynamique du prompt
- [x] **T66** — Tests + commits

## Commandes

```
!remind 2h réunion avec Paul         → rappel dans 2h
!remind 30m checker les logs         → rappel dans 30min
!remind 1d backup hebdomadaire       → rappel dans 24h
!schedule list                       → voir tous les jobs (dont rappels)
!schedule remove <id>                → annuler un rappel
```

## Config `.env`

Aucune config supplémentaire — utilise les mêmes credentials MM que le bridge principal.
