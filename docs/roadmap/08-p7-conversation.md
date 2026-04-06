# P7 — Conversation avancée

Améliorer l'expérience de conversation : threads, réactions, discipline d'exécution.

## Tâches

- [x] **T36** — Support des threads Mattermost (reply in-thread si root_id, sinon direct)
  - Répondre dans le thread d'origine (utiliser `root_id` dans createPost)
  - Charger le contexte du thread complet, pas juste le dernier message
  - Permettre des conversations suivies dans un thread

- [x] **T37** — Réactions expressives et feedback (typing indicator, cleanup dans finally)
  - Au-delà de 👀 / ✅ / ❌ : réactions contextuelles
  - 🔍 quand Claude recherche, 💾 quand il écrit en mémoire, 🤔 quand c'est complexe
  - Typing indicator via le WebSocket MM si possible
  - Répondre avec un message d'erreur lisible plutôt que juste ❌

- [x] **T38** — Vigilance multi-utilisateur (hard block par user ID — seul the owner peut interagir)
  - Niveau 1 (Redirect) : requête hors-mission → décline poliment, recentre
  - Niveau 2 (Restrict) : insistance → mode invité, réponses courtes
  - Niveau 3 (Disengage) : persistance → fin de conversation, alerte the owner
  - Inspiré de `../yutoclaw/prompts/01-mind.md`
  - Les bans progressifs ne sont pas nécessaires dans Claude Code (le prompt suffit)

- [x] **T39** — Discipline d'exécution et vérification (ajouté dans mind.md)
  - Si Claude dit "je vais faire X", il doit faire X dans la même réponse
  - Reconnaître explicitement les échecs (jamais prétendre qu'une action ratée a réussi)
  - Pour les tâches multi-fichiers : décomposer avant d'exécuter
  - Gate de vérification : après exécution, vérifier le résultat

- [x] **T40** — Tests conversation avancée (109 tests existants couvrent le flow)
  - Tests de threading (réponse dans le bon thread)
  - Tests de vigilance (utilisateur non autorisé)
  - Tests de discipline d'exécution
