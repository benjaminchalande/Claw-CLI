# Design — Mémoire structurée

## Zones

| Zone | Contenu | Accès |
|------|---------|-------|
| `internal` | Décisions, stratégie, patterns, erreurs de l'agent | Agent seul |
| `external` | FAQ, docs, procédures publiques | Tous |
| `user` | Préférences, expertise, historique par utilisateur | Cloisonné par user_id |

## Identification d'une entrée

Clé unique : `(zone, user_id, theme, name)`

- **zone** : internal / external / user
- **user_id** : vide sauf pour zone user
- **theme** : catégorie libre (ex: "mattermost", "comptabilité", "")
- **name** : identifiant (ex: "config-serveur", "preferences")

## Métadonnées

- **importance** : 1 (info), 2 (correction/important), 3 (critique)
- **source** : explicit, auto, introspection, consolidation
- **created_at** / **updated_at** : timestamps

## Recherche

FTS5 (SQLite full-text search) sur `name` + `content`.
Tokenizer `unicode61 remove_diacritics 2` pour support français.

Scoring tri-facteur (comme yutoclaw) :
- **Recency** : entrées récentes favorisées
- **Importance** : pondération 1-3
- **Relevance** : score FTS5

## CLI

```bash
memory write --zone internal --name "config" --content "..."
memory read --zone internal --name "config"
memory search "mattermost token"
memory list --zone internal
memory delete --zone internal --name "config"
```

## Intégration Claude Code

La skill `/go-claudeclaw` pourrait invoquer `memory search` pour charger du contexte pertinent avant chaque session.
Le bridge Mattermost pourrait invoquer `memory read` pour injecter du contexte dans les prompts.
