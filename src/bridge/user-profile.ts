import type { MemoryStore } from '../memory/store.js';

export interface UserProfile {
  username: string;
  language: string;
  expertise: string;
  style: string;
  notes: string;
  messageCount: number;
}

const PROFILE_NAME = 'profile';

/** Normalize username: strip leading @ if present. */
function normalizeUsername(username: string): string {
  return username.startsWith('@') ? username.slice(1) : username;
}

/** Read a user's profile from memory. Returns null if no profile exists. */
export function getUserProfile(memory: MemoryStore, username: string): UserProfile | null {
  const entry = memory.read('user', PROFILE_NAME, normalizeUsername(username));
  if (!entry) return null;
  try {
    return JSON.parse(entry.content) as UserProfile;
  } catch {
    return null;
  }
}

/** Save or update a user's profile in memory. */
export function saveUserProfile(memory: MemoryStore, profile: UserProfile): void {
  memory.write({
    zone: 'user',
    name: PROFILE_NAME,
    user_id: normalizeUsername(profile.username),
    content: JSON.stringify(profile),
    importance: 2,
    source: 'auto',
  });
}

/** Increment message count and return the updated profile. Creates a default profile if none exists. */
export function touchUserProfile(memory: MemoryStore, username: string): UserProfile {
  const normalized = normalizeUsername(username);
  let profile = getUserProfile(memory, normalized);
  if (!profile) {
    profile = {
      username: normalized,
      language: 'fr',
      expertise: 'unknown',
      style: 'unknown',
      notes: '',
      messageCount: 0,
    };
  }
  profile.messageCount++;
  saveUserProfile(memory, profile);
  return profile;
}

/** Format a user profile for prompt injection. Returns empty string for new/unknown users. */
export function formatUserProfile(profile: UserProfile | null): string {
  if (!profile || profile.messageCount < 2) return '';

  const parts: string[] = [`Profil de @${profile.username} :`];
  if (profile.expertise !== 'unknown') parts.push(`- Expertise : ${profile.expertise}`);
  if (profile.style !== 'unknown') parts.push(`- Style : ${profile.style}`);
  if (profile.language !== 'fr') parts.push(`- Langue : ${profile.language}`);
  if (profile.notes) parts.push(`- Notes : ${profile.notes}`);
  parts.push(`- Messages échangés : ${profile.messageCount}`);

  return parts.length > 2 ? parts.join('\n') : '';
}
