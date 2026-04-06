# P10 — Bridge WhatsApp

Canal WhatsApp via Baileys (non officiel, zéro coût, usage perso).

## Architecture

```
WhatsApp (Baileys) → src/bridges/whatsapp/
                        ├── client.ts      — wrapper Baileys (connect, send, typing)
                        ├── bridge.ts      — orchestration (message → claude → reply)
                        ├── index.ts       — entry point + singleton
                        └── __tests__/
                            ├── mock-whatsapp.ts  — émulateur Baileys pour tests
                            └── e2e.test.ts
```

Partage avec le bridge MM : `invokeClaude()`, `initBridgeServices()`, prompt builder, mémoire.

## Tâches

- [x] **T55** — Structure + client WhatsApp → `client.ts`
- [x] **T56** — Bridge WhatsApp → `bridge.ts`
- [x] **T57** — Filtrage owner par numéro + dedup + typing
- [x] **T58** — Mock WhatsApp (émulateur Baileys)
- [x] **T59** — Tests E2E (6 tests : owner OK, non-owner bloqué, groupe ignoré, typing, dedup, 1 reply)
- [x] **T60** — Entry point singleton + systemd service
- [ ] **T61** — Documentation setup (.env, QR code) — à faire quand Benjamin fournit le numéro

## Config `.env`

```env
WA_OWNER_PHONE=33612345678
WA_SESSION_DIR=./data/whatsapp-session
```

## Lancement

```bash
# Installer Baileys (dépendance optionnelle)
npm install @whiskeysockets/baileys

# Configurer .env avec le numéro
# Lancer (scanne le QR code au premier démarrage)
npm run bridge:wa
```
