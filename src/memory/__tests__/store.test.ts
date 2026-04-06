import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { MemoryStore } from '../store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION = readFileSync(join(__dirname, '..', '..', '..', 'migrations', '001_memory.sql'), 'utf-8');

let db: Database.Database;
let store: MemoryStore;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(MIGRATION);
  store = new MemoryStore(db);
});

afterEach(() => {
  db.close();
});

describe('MemoryStore', () => {
  describe('write & read', () => {
    it('writes and reads an entry', () => {
      store.write({ zone: 'internal', name: 'config', content: 'test content' });
      const entry = store.read('internal', 'config');
      expect(entry).not.toBeNull();
      expect(entry!.content).toBe('test content');
      expect(entry!.zone).toBe('internal');
      expect(entry!.importance).toBe(1);
    });

    it('upserts on duplicate key', () => {
      store.write({ zone: 'internal', name: 'config', content: 'v1' });
      store.write({ zone: 'internal', name: 'config', content: 'v2', importance: 3 });
      const entry = store.read('internal', 'config');
      expect(entry!.content).toBe('v2');
      expect(entry!.importance).toBe(3);
    });

    it('reads by id', () => {
      const written = store.write({ zone: 'internal', name: 'x', content: 'hello' });
      const entry = store.readById(written.id);
      expect(entry!.name).toBe('x');
    });

    it('returns null for missing entry', () => {
      expect(store.read('internal', 'nope')).toBeNull();
      expect(store.readById(999)).toBeNull();
    });
  });

  describe('zones', () => {
    it('separates entries by zone', () => {
      store.write({ zone: 'internal', name: 'x', content: 'int' });
      store.write({ zone: 'external', name: 'x', content: 'ext' });
      expect(store.read('internal', 'x')!.content).toBe('int');
      expect(store.read('external', 'x')!.content).toBe('ext');
    });

    it('separates user entries by user_id', () => {
      store.write({ zone: 'user', name: 'prefs', content: 'alice', user_id: 'alice' });
      store.write({ zone: 'user', name: 'prefs', content: 'bob', user_id: 'bob' });
      expect(store.read('user', 'prefs', 'alice')!.content).toBe('alice');
      expect(store.read('user', 'prefs', 'bob')!.content).toBe('bob');
    });
  });

  describe('themes', () => {
    it('separates entries by theme', () => {
      store.write({ zone: 'internal', name: 'config', content: 'general', theme: '' });
      store.write({ zone: 'internal', name: 'config', content: 'mm', theme: 'mattermost' });
      expect(store.read('internal', 'config', '', '')!.content).toBe('general');
      expect(store.read('internal', 'config', '', 'mattermost')!.content).toBe('mm');
    });

    it('lists themes', () => {
      store.write({ zone: 'internal', name: 'a', content: '1', theme: 'alpha' });
      store.write({ zone: 'internal', name: 'b', content: '2', theme: 'beta' });
      store.write({ zone: 'internal', name: 'c', content: '3' }); // no theme
      const themes = store.listThemes('internal');
      expect(themes).toEqual(['alpha', 'beta']);
    });
  });

  describe('append', () => {
    it('creates entry if not exists', () => {
      store.append({ zone: 'internal', name: 'log', content: 'line 1' });
      expect(store.read('internal', 'log')!.content).toBe('line 1');
    });

    it('appends to existing entry', () => {
      store.write({ zone: 'internal', name: 'log', content: 'line 1' });
      store.append({ zone: 'internal', name: 'log', content: 'line 2' });
      expect(store.read('internal', 'log')!.content).toBe('line 1\nline 2');
    });

    it('keeps max importance on append', () => {
      store.write({ zone: 'internal', name: 'log', content: 'x', importance: 3 });
      store.append({ zone: 'internal', name: 'log', content: 'y', importance: 1 });
      expect(store.read('internal', 'log')!.importance).toBe(3);
    });
  });

  describe('delete', () => {
    it('deletes existing entry', () => {
      store.write({ zone: 'internal', name: 'x', content: 'y' });
      expect(store.delete('internal', 'x')).toBe(true);
      expect(store.read('internal', 'x')).toBeNull();
    });

    it('returns false for missing entry', () => {
      expect(store.delete('internal', 'nope')).toBe(false);
    });
  });

  describe('list & count', () => {
    it('lists entries in a zone', () => {
      store.write({ zone: 'internal', name: 'a', content: '1', importance: 1 });
      store.write({ zone: 'internal', name: 'b', content: '2', importance: 3 });
      const entries = store.list('internal');
      expect(entries).toHaveLength(2);
      expect(entries[0].name).toBe('b'); // importance DESC
    });

    it('lists all entries', () => {
      store.write({ zone: 'internal', name: 'a', content: '1' });
      store.write({ zone: 'external', name: 'b', content: '2' });
      expect(store.listAll()).toHaveLength(2);
      expect(store.listAll('internal')).toHaveLength(1);
    });

    it('counts entries', () => {
      store.write({ zone: 'internal', name: 'a', content: '1' });
      store.write({ zone: 'external', name: 'b', content: '2' });
      expect(store.count()).toBe(2);
      expect(store.count('internal')).toBe(1);
    });
  });

  describe('search', () => {
    it('finds entries by content', () => {
      store.write({ zone: 'internal', name: 'mm-config', content: 'Configuration du serveur Mattermost' });
      store.write({ zone: 'internal', name: 'git-config', content: 'Configuration du dépôt Git' });
      const results = store.search('Mattermost');
      expect(results).toHaveLength(1);
      expect(results[0].entry.name).toBe('mm-config');
    });

    it('finds entries by name', () => {
      store.write({ zone: 'internal', name: 'mattermost-token', content: 'abc123' });
      const results = store.search('mattermost');
      expect(results).toHaveLength(1);
    });

    it('filters by zone', () => {
      store.write({ zone: 'internal', name: 'secret', content: 'mot de passe' });
      store.write({ zone: 'external', name: 'faq', content: 'mot de passe oublié' });
      const results = store.search('mot de passe', { zone: 'internal' });
      expect(results).toHaveLength(1);
      expect(results[0].entry.zone).toBe('internal');
    });

    it('returns empty for no match', () => {
      store.write({ zone: 'internal', name: 'x', content: 'hello' });
      const results = store.search('zzzznotfound');
      expect(results).toHaveLength(0);
    });

    it('scores higher importance entries higher', () => {
      store.write({ zone: 'internal', name: 'low', content: 'test memory system', importance: 1 });
      store.write({ zone: 'internal', name: 'high', content: 'test memory system', importance: 3 });
      const results = store.search('test memory');
      expect(results).toHaveLength(2);
      expect(results[0].entry.name).toBe('high');
    });
  });
});
