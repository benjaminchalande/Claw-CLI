/**
 * Envoi de notifications Mattermost depuis le scheduler.
 * Utilisé quand delivery_mode === 'announce'.
 */

export interface NotifyConfig {
  mmUrl: string;
  mmToken: string;
  botUserId: string;
}

/** Envoie un message sur un channel ou en DM. */
export async function notifyMattermost(
  config: NotifyConfig,
  target: string,
  message: string,
): Promise<void> {
  // target peut être un channel_id ou un username
  let channelId = target;

  // Si target ressemble à un username (pas un ID hex de 26 chars), ouvrir un DM
  if (target.length !== 26 || !/^[a-z0-9]+$/.test(target)) {
    channelId = await resolveTarget(config, target);
  }

  const resp = await fetch(`${config.mmUrl}/api/v4/posts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.mmToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel_id: channelId, message }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`MM notify failed (${resp.status}): ${text.slice(0, 200)}`);
  }
}

/** Résout un username en channel DM. */
async function resolveTarget(config: NotifyConfig, username: string): Promise<string> {
  // Trouver le user ID
  const userResp = await fetch(
    `${config.mmUrl}/api/v4/users/username/${encodeURIComponent(username)}`,
    { headers: { 'Authorization': `Bearer ${config.mmToken}` } },
  );
  if (!userResp.ok) throw new Error(`User not found: ${username}`);
  const user = await userResp.json() as { id: string };

  // Ouvrir le DM channel
  const dmResp = await fetch(`${config.mmUrl}/api/v4/channels/direct`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.mmToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([config.botUserId, user.id]),
  });
  if (!dmResp.ok) throw new Error(`Failed to open DM with ${username}`);
  const channel = await dmResp.json() as { id: string };
  return channel.id;
}
