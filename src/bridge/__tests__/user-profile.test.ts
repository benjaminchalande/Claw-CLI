import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { MemoryStore } from '../../memory/store.js';
import { getUserProfile, saveUserProfile, touchUserProfile, formatUserProfile } from '../user-profile.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION = readFileSync(join(__dirname, '..', '..', '..', 'migrations', '001_memory.sql'), 'utf-8');

let db: Database.Database;
let store: MemoryStore;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(MIGRATION);
  store = new MemoryStore(db);
});

afterEach(() => db.close());

describe('UserProfile', () => {
  it('returns null for unknown user', () => {
    expect(getUserProfile(store, 'nobody')).toBeNull();
  });

  it('creates profile on first touch', () => {
    const profile = touchUserProfile(store, 'benjamin');
    expect(profile.username).toBe('benjamin');
    expect(profile.messageCount).toBe(1);
    expect(profile.language).toBe('fr');
  });

  it('increments count on subsequent touches', () => {
    touchUserProfile(store, 'benjamin');
    touchUserProfile(store, 'benjamin');
    const profile = touchUserProfile(store, 'benjamin');
    expect(profile.messageCount).toBe(3);
  });

  it('saves and reads profile', () => {
    saveUserProfile(store, {
      username: 'alice',
      language: 'en',
      expertise: 'senior',
      style: 'concise',
      notes: 'prefers code examples',
      messageCount: 10,
    });

    const profile = getUserProfile(store, 'alice');
    expect(profile).not.toBeNull();
    expect(profile!.expertise).toBe('senior');
    expect(profile!.notes).toBe('prefers code examples');
  });

  it('formats profile only after 2+ messages', () => {
    const p1 = touchUserProfile(store, 'ben');
    expect(formatUserProfile(p1)).toBe('');

    const p2 = touchUserProfile(store, 'ben');
    // Still no useful info to show (expertise/style = unknown)
    expect(formatUserProfile(p2)).toBe('');
  });

  it('formats profile with known fields', () => {
    const profile = {
      username: 'ben',
      language: 'fr',
      expertise: 'senior dev',
      style: 'direct',
      notes: '',
      messageCount: 5,
    };
    const formatted = formatUserProfile(profile);
    expect(formatted).toContain('senior dev');
    expect(formatted).toContain('direct');
    expect(formatted).toContain('5');
  });

  it('separates profiles by user', () => {
    touchUserProfile(store, 'alice');
    touchUserProfile(store, 'bob');
    touchUserProfile(store, 'alice');

    expect(getUserProfile(store, 'alice')!.messageCount).toBe(2);
    expect(getUserProfile(store, 'bob')!.messageCount).toBe(1);
  });
});
