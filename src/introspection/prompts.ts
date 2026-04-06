/**
 * Prompts d'introspection pour les jobs planifiés.
 * Inspirés des cycles T1/T2/T3 de yutoclaw (internal/introspection/).
 *
 * T1 (fréquent, ~30min) : mémorisation — extraire et persister les faits importants
 * T2 (quotidien) : consolidation — nettoyer, fusionner, résumer la mémoire
 * T3 (hebdomadaire) : réflexion — bilan, ajustement de la roadmap
 */

/** T1 — Mémorisation rapide. Sauvegarde les faits récents en mémoire. */
export const MEMORIZE_PROMPT = `Tu es Claw CLI en mode introspection.

Tâche : Passe en revue les conversations récentes et persiste les informations utiles en mémoire.

1. Lis les derniers messages reçus via le bridge (git log des dernières heures si disponible)
2. Identifie les faits, décisions ou préférences à retenir
3. Sauvegarde-les en mémoire via :
   npx tsx src/memory/cli.ts write --zone internal --name "<nom>" --content "<contenu>"
4. Résume brièvement ce que tu as mémorisé

Sois sélectif : ne sauvegarde que ce qui sera utile dans les prochaines sessions.`;

/** T2 — Consolidation mémoire. Nettoie, fusionne, résume. */
export const CONSOLIDATE_PROMPT = `Tu es Claw CLI en mode introspection.

Tâche : Consolide la mémoire — supprime les doublons, fusionne les entrées liées, résume les entrées trop longues.

1. Liste toutes les entrées mémoire :
   npx tsx src/memory/cli.ts list
2. Lis les entrées volumineuses et identifie :
   - Les doublons ou quasi-doublons → fusionner
   - Les entrées obsolètes → supprimer
   - Les entrées trop longues → résumer
3. Effectue les modifications via les commandes write/delete
4. Rapport : nombre d'entrées avant/après, actions effectuées

Objectif : garder la mémoire concise et utile.`;

/** T3 — Réflexion et bilan. Mise à jour roadmap, rapport d'état. */
export const REFLECT_PROMPT = `Tu es Claw CLI en mode introspection.

Tâche : Fais un bilan de la semaine et mets à jour la feuille de route.

1. Lis l'état actuel de la roadmap :
   - docs/roadmap/00-overview.md
   - Tous les fichiers de phase
2. Vérifie l'état réel du code (git log de la semaine, tests)
3. Mets à jour la roadmap si nécessaire :
   - Marque les tâches réellement terminées
   - Identifie les blockers
   - Propose les prochaines priorités
4. Envoie un rapport d'état sur Mattermost si configuré

Sois factuel et concis.`;

/** Rapport d'état quotidien. */
export const STATUS_REPORT_PROMPT = `Tu es Claw CLI.

Tâche : Génère un rapport d'état concis du projet.

1. Lis docs/roadmap/00-overview.md
2. Vérifie git log (dernières 24h)
3. Lance les tests (npm test)
4. Résume en 5 lignes max : ce qui a été fait, l'état des tests, les prochaines tâches`;

/** Synchronisation roadmap — vérifie et corrige la cohérence roadmap vs code. */
export const ROADMAP_SYNC_PROMPT = `Tu es Claw CLI en mode synchronisation roadmap.

Tâche : Vérifie que la feuille de route reflète l'état réel du code et corrige les incohérences.

1. Lis TOUS les fichiers de roadmap (docs/roadmap/*.md)
2. Pour chaque tâche marquée comme faite (- [x]), vérifie que le code/fichier existe réellement
3. Pour chaque tâche non faite (- [ ]), vérifie qu'elle n'est pas déjà implémentée
4. Vérifie que 00-overview.md est à jour (phase active, dernière tâche, dépendances)
5. Corrige les incohérences trouvées (modifier les fichiers roadmap)
6. Si des dépendances utilisateur ont été résolues (tokens fournis, etc.), mets-les à jour

Ne crée PAS de nouvelles tâches. Corrige seulement l'existant.`;
