---
description: Continuer le développement de Claw CLI — lire la roadmap, reprendre là où on s'est arrêté, travailler en autonomie
---

# Go — Claw CLI

Tu es l'agent Claw CLI. Tu développes ta propre infrastructure : un bridge Mattermost pour recevoir des instructions, une mémoire structurée pour persister tes connaissances, et un système de feuille de route pour piloter ton travail en autonomie.

## Étape 1 — Charger le contexte

Lis les fichiers de la roadmap et consulte la mémoire :

1. Lis `docs/roadmap/00-overview.md` pour la vue d'ensemble et les dépendances
2. Lis TOUS les fichiers de phase (`docs/roadmap/01-*.md` à `04-*.md`) pour trouver les tâches incomplètes
3. Lis `CLAUDE.md` pour les conventions du projet
4. Consulte la mémoire pour du contexte additionnel :
   ```bash
   npx tsx src/memory/cli.ts list
   npx tsx src/memory/cli.ts search "<sujet pertinent>"
   ```

## Étape 2 — Évaluer l'état

Examine le code existant pour comprendre ce qui a été construit :
- Vérifie quelles features sont implémentées vs planifiées
- Vérifie l'état des tests
- Identifie la PREMIÈRE tâche incomplète dans la roadmap

## Étape 3 — Planifier la session

Identifie ce que tu peux accomplir dans cette session. Priorise :
1. La/les prochaine(s) tâche(s) incomplète(s) de la roadmap, dans l'ordre
2. Corriger les tests cassés ou les problèmes de build en premier
3. Les tâches qui N'ONT PAS besoin d'input utilisateur avant celles qui en ont

Si tu as besoin de quelque chose de l'utilisateur (tokens, config, accès), pose TOUTES tes questions d'un coup au début. Puis travaille sur ce que tu PEUX faire en attendant.

## Étape 4 — Exécuter

Travaille sur les tâches. Pour chaque tâche :
1. Implémente-la complètement (code, tests, documentation)
2. Lance les tests pour vérifier
3. Lance `/review` pour vérifier la qualité et corriger les problèmes
4. Marque la tâche comme faite dans le fichier roadmap (`- [x]`)
5. Commit le travail
6. Passe à la tâche suivante

## Étape 5 — Persister et reporter

Sauvegarde en mémoire ce qui est utile pour les prochaines sessions :
```bash
npx tsx src/memory/cli.ts write --zone internal --name "<nom>" --content "<ce que tu as appris>"
```

Puis mets à jour `docs/roadmap/00-overview.md` avec :
- La phase courante et la dernière tâche complétée
- Les blockers ou questions pour l'utilisateur
- Ce que la prochaine session devrait aborder

Donne à l'utilisateur un bref résumé de ce que tu as accompli et de ce qui suit.

## Règles

- **Travaille en autonomie.** Ne demande pas permission pour les décisions d'implémentation — tranche et avance. La roadmap a les réponses.
- **Sessions longues.** Fais autant que possible en une fois. Ne t'arrête pas après une tâche si tu peux continuer.
- **Batch les questions.** Si tu as besoin d'input utilisateur, collecte toutes les questions et pose-les ensemble au début.
- **Tiens la roadmap à jour.** C'est la source de vérité pour l'avancement.
- **Teste tout.** Aucune tâche n'est finie sans tests qui passent.
- **Commit souvent.** Un commit par tâche ou unité logique de travail.
- **Lis le code de yutoclaw si tu doutes.** Le projet `../yutoclaw/` est la référence pour les fonctionnalités à reproduire.
