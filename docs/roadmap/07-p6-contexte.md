# P6 — Intelligence contextuelle

Injecter la mémoire dans les conversations et adapter les réponses à chaque utilisateur.
Actuellement Claude répond sans aucun contexte — il ne sait rien de l'historique projet ni de l'interlocuteur.

## Diagnostic

- `invokeClaude()` est appelé **sans `allowTools`** → Claude n'a accès à rien (ni mémoire, ni fichiers)
- Aucune mémoire injectée dans le prompt
- Pas de profil utilisateur
- L'historique est basique (20 messages, texte brut)

## Tâches

- [x] **T31** — Injection mémoire dans le prompt
  - Avant chaque réponse, rechercher les mémoires pertinentes via `MemoryStore.search()`
  - Injecter les résultats les plus pertinents dans le prompt (budget max ~2000 tokens)
  - Zones à interroger : `internal` (contexte agent) + `external` (connaissances) + `user` (profil interlocuteur)
  - Trier par score de pertinence (le scoring FTS5 existe déjà)

- [x] **T32** — Activer les outils pour les conversations (allowTools pour the owner uniquement)
  - Passer `allowTools: true` dans l'appel `invokeClaude()`
  - Claude peut ainsi lire des fichiers, chercher en mémoire, faire des recherches web
  - Ça transforme les conversations de "text in → text out" en "agent capable d'agir"
  - Limiter les outils sensibles (pas de Write/Edit depuis Mattermost sauf pour the owner)

- [x] **T33** — Profils utilisateur automatiques → `src/bridge/user-profile.ts`
  - Zone mémoire `user` : stocker un profil par interlocuteur
  - Champs : `expertise_level`, `communication_style`, `language_register`, `preferred_depth`
  - Après 3+ conversations, le profil se stabilise (mise à jour uniquement sur divergence)
  - Le profil est injecté dans le prompt quand cet utilisateur parle

- [x] **T34** — Enrichissement du contexte d'historique (persisté SQLite, survit au restart)
  - Rendre l'historique plus intelligent : pas juste les 20 derniers messages
  - Résumer les conversations anciennes plutôt que de les tronquer
  - Injecter le contexte du thread MM (pas juste le channel)
  - Persister l'historique (actuellement en mémoire seulement, perdu au restart)

- [x] **T35** — Tests injection mémoire et profils (13 tests : user-profile + history-sqlite)
  - Vérifier que la recherche mémoire retourne des résultats pertinents
  - Vérifier que le profil est créé et mis à jour correctement
  - Vérifier que le budget token est respecté
