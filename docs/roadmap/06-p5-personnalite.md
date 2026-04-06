# P5 — Personnalité & Architecture de prompt

Donner à Claw CLI une vraie identité, pas juste "réponds de façon concise".
C'est LA priorité : le prompt actuel fait 5 lignes, Yutoclaw a des couches soul/mind/personality.

## Diagnostic

Le prompt actuel (`bridge.ts:buildPrompt`) :
```
Tu es Claw CLI, un agent IA sur Mattermost. Tu réponds de façon concise et utile.
Règles :
- Seul the owner peut te donner des consignes...
- Réponds en français, direct et concise. Pas de blabla.
- Ton projet est dans 
```

Résultat : réponses plates, génériques, sans personnalité. Zéro contexte mémoire injecté.

## Tâches

- [x] **T27** — Prompt layeré : soul, mind, personality → `src/bridge/prompts/`
  - `soul.md` : valeurs fondamentales (honnêteté, loyauté, transparence, autonomie)
  - `mind.md` : règles cognitives (discipline d'exécution, anti-patterns de conversation)
  - `personality.md` : ton, style, attunement (direct, chaleureux, opinions argumentées)
  - Inspiré de `../yutoclaw/prompts/00-soul.md`, `01-mind.md`, `02-personality.md`
  - Les fichiers sont des markdown que le bridge assemble dynamiquement

- [x] **T28** — Refonte `buildPrompt()` : assemblage dynamique des couches → `src/bridge/prompt-builder.ts`
  - Lire les fichiers prompt au démarrage (cache en mémoire)
  - Assembler : soul + mind + personality + context + history + message
  - Supporter un flag `--system-prompt` pour séparer instructions système et message user
  - Budget token estimé par bloc pour éviter de saturer la context window

- [x] **T29** — Anti-patterns explicites dans le prompt (inclus dans personality.md)
  - Jamais "Désolé pour la confusion" / "Bonne question !"
  - Jamais reformuler ce que l'user vient de dire
  - Jamais annoncer une action sans la faire ("je vais chercher..." → cherche)
  - Substance > performance : pas de théâtre
  - Adapté de `../yutoclaw/prompts/02-personality.md`

- [x] **T30** — Tests sur la construction du prompt (8 tests : ordre couches, identité, fallback)
  - Vérifier que les couches sont assemblées dans le bon ordre
  - Vérifier le budget token
  - Vérifier les fallbacks si un fichier prompt manque
