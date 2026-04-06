-- Ajouter la plateforme d'origine à chaque message.
-- Permet l'historique cross-canal (CLI, Mattermost, WhatsApp).

ALTER TABLE conversation_messages ADD COLUMN platform TEXT NOT NULL DEFAULT 'unknown';

CREATE INDEX IF NOT EXISTS idx_conv_platform ON conversation_messages(platform);
