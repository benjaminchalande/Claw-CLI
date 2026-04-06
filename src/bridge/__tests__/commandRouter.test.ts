import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SchedulerStore } from '../../scheduler/store.js';
import {
  parseCommand,
  parseScheduleCommand,
  parseRemindCommand,
  handleCommand,
  handleScheduleCommand,
  isAdminUser,
  ParseError,
  type RemindersListCommand,
  type ReminderCancelCommand,
} from '../commands/commandRouter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Utilise la migration P11 (005) qui inclut delivery_mode 'direct'
const MIGRATION = readFileSync(
  join(__dirname, '..', '..', '..', 'migrations', '005_scheduler.sql'),
  'utf-8',
);

// ─── isAdminUser ──────────────────────────────────────────────────────────────

describe('isAdminUser', () => {
  const TEST_ADMIN = 'test-admin-id';

  it('reconnaît l\'admin par défaut', () => {
    process.env.MM_OWNER_USER_ID = TEST_ADMIN;
    delete process.env.MATTERMOST_ADMIN_USER_ID;
    expect(isAdminUser(TEST_ADMIN)).toBe(true);
  });

  it('rejette les autres utilisateurs', () => {
    delete process.env.MATTERMOST_ADMIN_USER_ID;
    expect(isAdminUser('random-user-id')).toBe(false);
  });

  it('respecte l\'override via env', () => {
    process.env.MATTERMOST_ADMIN_USER_ID = 'custom-admin';
    expect(isAdminUser('custom-admin')).toBe(true);
    expect(isAdminUser(TEST_ADMIN)).toBe(false);
    delete process.env.MATTERMOST_ADMIN_USER_ID;
  });
});

// ─── parseCommand ─────────────────────────────────────────────────────────────

describe('parseCommand', () => {
  it('retourne null pour un texte ordinaire', () => {
    expect(parseCommand('bonjour')).toBeNull();
    expect(parseCommand('tu peux m\'aider ?')).toBeNull();
  });

  it('route !schedule vers parseScheduleCommand', () => {
    const cmd = parseCommand('!schedule list');
    expect(cmd).toEqual({ type: 'schedule', sub: 'list' });
  });

  it('route !remind vers parseRemindCommand', () => {
    const cmd = parseCommand('!remind 2h réunion avec Paul');
    expect(cmd).toMatchObject({ type: 'remind', delay: '2h', message: 'réunion avec Paul' });
  });
});

// ─── parseScheduleCommand ─────────────────────────────────────────────────────

describe('parseScheduleCommand', () => {
  it('retourne null si pas de préfixe !schedule', () => {
    expect(parseScheduleCommand('bonjour')).toBeNull();
    expect(parseScheduleCommand('schedule list')).toBeNull();
    expect(parseScheduleCommand('  liste tout')).toBeNull();
  });

  it('lève ParseError pour !schedule sans sous-commande', () => {
    expect(() => parseScheduleCommand('!schedule')).toThrow(ParseError);
    expect(() => parseScheduleCommand('!schedule help')).toThrow(ParseError);
  });

  it('parse !schedule list', () => {
    const cmd = parseScheduleCommand('!schedule list');
    expect(cmd).toEqual({ type: 'schedule', sub: 'list' });
  });

  it('parse !schedule list avec espaces', () => {
    const cmd = parseScheduleCommand('  !schedule  list  ');
    expect(cmd).toEqual({ type: 'schedule', sub: 'list' });
  });

  it('parse !schedule add avec cron entre guillemets', () => {
    const cmd = parseScheduleCommand('!schedule add "0 9 * * 1-5" "Résume les emails du jour"');
    expect(cmd).toEqual({
      type: 'schedule',
      sub: 'add',
      cron: '0 9 * * 1-5',
      prompt: 'Résume les emails du jour',
    });
  });

  it('parse !schedule add avec cron sans guillemets', () => {
    const cmd = parseScheduleCommand('!schedule add 0 9 * * 1-5 "Mon prompt"');
    expect(cmd).toMatchObject({ type: 'schedule', sub: 'add', prompt: 'Mon prompt' });
  });

  it('parse !schedule add avec interval', () => {
    const cmd = parseScheduleCommand('!schedule add 1h "Vérifier le statut du serveur"');
    expect(cmd).toEqual({
      type: 'schedule',
      sub: 'add',
      cron: '1h',
      prompt: 'Vérifier le statut du serveur',
    });
  });

  it('lève ParseError pour !schedule add sans guillemets de prompt', () => {
    expect(() => parseScheduleCommand('!schedule add 1h pas de guillemets')).toThrow(ParseError);
  });

  it('lève ParseError pour !schedule add avec cron invalide', () => {
    expect(() => parseScheduleCommand('!schedule add "pas un cron" "prompt"')).toThrow(ParseError);
  });

  it('lève ParseError pour !schedule add avec prompt vide', () => {
    expect(() => parseScheduleCommand('!schedule add 1h ""')).toThrow(ParseError);
  });

  it('parse !schedule pause <id>', () => {
    const cmd = parseScheduleCommand('!schedule pause 42');
    expect(cmd).toEqual({ type: 'schedule', sub: 'pause', id: 42 });
  });

  it('parse !schedule resume <id>', () => {
    const cmd = parseScheduleCommand('!schedule resume 7');
    expect(cmd).toEqual({ type: 'schedule', sub: 'resume', id: 7 });
  });

  it('parse !schedule remove <id>', () => {
    const cmd = parseScheduleCommand('!schedule remove 3');
    expect(cmd).toEqual({ type: 'schedule', sub: 'remove', id: 3 });
  });

  it('parse !schedule run <id>', () => {
    const cmd = parseScheduleCommand('!schedule run 1');
    expect(cmd).toEqual({ type: 'schedule', sub: 'run', id: 1 });
  });

  it('lève ParseError si id manquant ou non numérique', () => {
    expect(() => parseScheduleCommand('!schedule pause')).toThrow(ParseError);
    expect(() => parseScheduleCommand('!schedule pause abc')).toThrow(ParseError);
    expect(() => parseScheduleCommand('!schedule remove 0')).toThrow(ParseError);
  });

  it('lève ParseError pour sous-commande inconnue', () => {
    expect(() => parseScheduleCommand('!schedule grmpf')).toThrow(ParseError);
  });
});

// ─── parseRemindCommand ───────────────────────────────────────────────────────

describe('parseRemindCommand', () => {
  it('parse !remind 2h message', () => {
    const cmd = parseRemindCommand('!remind 2h réunion avec Paul');
    expect(cmd).toEqual({ type: 'remind', delay: '2h', message: 'réunion avec Paul' });
  });

  it('parse !remind 30m message', () => {
    const cmd = parseRemindCommand('!remind 30m checker les logs');
    expect(cmd).toEqual({ type: 'remind', delay: '30m', message: 'checker les logs' });
  });

  it('parse !remind 1d avec message multi-mots', () => {
    const cmd = parseRemindCommand('!remind 1d backup hebdomadaire de la base');
    expect(cmd).toEqual({ type: 'remind', delay: '1d', message: 'backup hebdomadaire de la base' });
  });

  it('parse !remind 45s message court', () => {
    const cmd = parseRemindCommand('!remind 45s test');
    expect(cmd).toEqual({ type: 'remind', delay: '45s', message: 'test' });
  });

  it('lève ParseError si pas de message', () => {
    expect(() => parseRemindCommand('!remind 2h')).toThrow(ParseError);
  });

  it('lève ParseError si délai seul sans message', () => {
    expect(() => parseRemindCommand('!remind 2h   ')).toThrow(ParseError);
  });

  it('lève ParseError si délai invalide', () => {
    expect(() => parseRemindCommand('!remind 2x message')).toThrow(ParseError);
    expect(() => parseRemindCommand('!remind abc message')).toThrow(ParseError);
  });

  it('lève ParseError si !remind vide', () => {
    expect(() => parseRemindCommand('!remind')).toThrow(ParseError);
    expect(() => parseRemindCommand('!remind  ')).toThrow(ParseError);
  });
});

// ─── handleScheduleCommand ────────────────────────────────────────────────────

describe('handleScheduleCommand', () => {
  let db: Database.Database;
  let store: SchedulerStore;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(MIGRATION);
    store = new SchedulerStore(db);
  });

  afterEach(() => {
    db.close();
  });

  it('list — retourne "Aucun job planifié" si vide', async () => {
    const result = await handleScheduleCommand({ type: 'schedule', sub: 'list' }, { store });
    expect(result).toBe('Aucun job planifié.');
  });

  it('add — crée un job et confirme', async () => {
    const result = await handleScheduleCommand(
      { type: 'schedule', sub: 'add', cron: '1h', prompt: 'Vérifier les logs' },
      { store },
    );
    expect(result).toMatch(/✅ Job #\d+ créé/);
    expect(result).toContain('1h');
    expect(result).toContain('Vérifier les logs');
    expect(store.count()).toBe(1);
  });

  it('list — affiche le job créé', async () => {
    await handleScheduleCommand(
      { type: 'schedule', sub: 'add', cron: '30m', prompt: 'Mon prompt' },
      { store },
    );
    const result = await handleScheduleCommand({ type: 'schedule', sub: 'list' }, { store });
    expect(result).toContain('| ID |');
    expect(result).toContain('30m');
    expect(result).toContain('active');
  });

  it('pause — met en pause un job actif', async () => {
    await handleScheduleCommand(
      { type: 'schedule', sub: 'add', cron: '1h', prompt: 'Test' },
      { store },
    );
    const job = store.list()[0];

    const result = await handleScheduleCommand(
      { type: 'schedule', sub: 'pause', id: job.id },
      { store },
    );
    expect(result).toMatch(/✅ Job #\d+ mis en pause/);
    expect(store.getById(job.id)!.status).toBe('paused');
  });

  it('pause — erreur si job déjà en pause', async () => {
    await handleScheduleCommand(
      { type: 'schedule', sub: 'add', cron: '1h', prompt: 'Test' },
      { store },
    );
    const job = store.list()[0];
    store.pause(job.id);

    const result = await handleScheduleCommand(
      { type: 'schedule', sub: 'pause', id: job.id },
      { store },
    );
    expect(result).toMatch(/❌/);
  });

  it('pause — erreur si job inexistant', async () => {
    const result = await handleScheduleCommand(
      { type: 'schedule', sub: 'pause', id: 999 },
      { store },
    );
    expect(result).toContain('introuvable');
  });

  it('resume — réactive un job en pause', async () => {
    await handleScheduleCommand(
      { type: 'schedule', sub: 'add', cron: '1h', prompt: 'Test' },
      { store },
    );
    const job = store.list()[0];
    store.pause(job.id);

    const result = await handleScheduleCommand(
      { type: 'schedule', sub: 'resume', id: job.id },
      { store },
    );
    expect(result).toMatch(/✅ Job #\d+ réactivé/);
    expect(store.getById(job.id)!.status).toBe('active');
  });

  it('resume — erreur si job pas en pause', async () => {
    await handleScheduleCommand(
      { type: 'schedule', sub: 'add', cron: '1h', prompt: 'Test' },
      { store },
    );
    const job = store.list()[0];

    const result = await handleScheduleCommand(
      { type: 'schedule', sub: 'resume', id: job.id },
      { store },
    );
    expect(result).toMatch(/❌/);
  });

  it('remove — supprime un job', async () => {
    await handleScheduleCommand(
      { type: 'schedule', sub: 'add', cron: '1h', prompt: 'Test' },
      { store },
    );
    const job = store.list()[0];

    const result = await handleScheduleCommand(
      { type: 'schedule', sub: 'remove', id: job.id },
      { store },
    );
    expect(result).toMatch(/✅ Job #\d+ supprimé/);
    expect(store.count()).toBe(0);
  });

  it('remove — erreur si job inexistant', async () => {
    const result = await handleScheduleCommand(
      { type: 'schedule', sub: 'remove', id: 999 },
      { store },
    );
    expect(result).toContain('introuvable');
  });

  it('run — erreur si job inexistant', async () => {
    const result = await handleScheduleCommand(
      { type: 'schedule', sub: 'run', id: 999 },
      { store },
    );
    expect(result).toContain('introuvable');
  });

  it('run — confirme l\'exécution d\'un job existant (claude mocké)', async () => {
    await handleScheduleCommand(
      { type: 'schedule', sub: 'add', cron: '1h', prompt: 'Test run' },
      { store },
    );
    const job = store.list()[0];

    // On mocke runDueJobs via claudePath inexistant — on vérifie juste que la
    // commande ne plante pas et renvoie le bon message (l'erreur d'exec est absorbée)
    const result = await handleScheduleCommand(
      { type: 'schedule', sub: 'run', id: job.id },
      { store, claudePath: '/bin/false', claudeTimeout: 1000 },
    );
    expect(result).toMatch(/✅ Job #\d+ exécuté/);
  });
});

// ─── handleCommand (!remind) ──────────────────────────────────────────────────

describe('handleCommand — !remind', () => {
  let db: Database.Database;
  let store: SchedulerStore;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(MIGRATION);
    store = new SchedulerStore(db);
  });

  afterEach(() => {
    db.close();
  });

  it('crée un job once avec delivery_mode direct', async () => {
    const result = await handleCommand(
      { type: 'remind', delay: '2h', message: 'réunion avec Paul' },
      { store, channelId: 'channel-123' },
    );

    expect(result).toMatch(/✅ Rappel #\d+/);
    expect(result).toContain('2h');
    expect(result).toContain('réunion avec Paul');

    const jobs = store.list();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].delivery_mode).toBe('direct');
    expect(jobs[0].schedule_type).toBe('once');
    expect(jobs[0].delivery_target).toBe('channel-123');
    expect(jobs[0].description).toBe('réunion avec Paul');
  });

  it('retourne erreur si channelId absent', async () => {
    const result = await handleCommand(
      { type: 'remind', delay: '1h', message: 'test' },
      { store },
    );
    expect(result).toContain('❌');
    expect(store.count()).toBe(0);
  });

  it('le job once est planifié dans le futur', async () => {
    const before = Date.now();
    await handleCommand(
      { type: 'remind', delay: '30m', message: 'test timer' },
      { store, channelId: 'chan-abc' },
    );
    const after = Date.now();

    const job = store.list()[0];
    const nextRun = new Date(job.next_run_at!).getTime();
    expect(nextRun).toBeGreaterThan(before + 29 * 60_000);
    expect(nextRun).toBeLessThan(after + 31 * 60_000);
  });

  it('supporte différents délais (1d, 45s)', async () => {
    await handleCommand(
      { type: 'remind', delay: '1d', message: 'backup' },
      { store, channelId: 'chan-1' },
    );
    const job = store.list()[0];
    const nextRun = new Date(job.next_run_at!).getTime();
    // Dans ~24h
    expect(nextRun).toBeGreaterThan(Date.now() + 23 * 3600_000);
  });
});

// ─── activeSummary ────────────────────────────────────────────────────────────

describe('SchedulerStore.activeSummary', () => {
  let db: Database.Database;
  let store: SchedulerStore;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(MIGRATION);
    store = new SchedulerStore(db);
  });

  afterEach(() => {
    db.close();
  });

  it('retourne une chaîne vide si aucun job actif', () => {
    expect(store.activeSummary()).toBe('');
  });

  it('liste les rappels directs avec emoji ⏰', () => {
    // Créer un rappel via handleCommand
    const futureDate = new Date(Date.now() + 3600_000).toISOString();
    store.create({
      name: 'remind-test',
      description: 'réunion avec Paul',
      schedule_type: 'once',
      schedule_value: futureDate,
      prompt: '',
      delivery_mode: 'direct',
      delivery_target: 'chan-123',
    });

    const summary = store.activeSummary();
    expect(summary).toContain('⏰ Rappel');
    expect(summary).toContain('réunion avec Paul');
    expect(summary).toContain('Jobs planifiés actifs');
  });

  it('liste les jobs cron avec emoji 🔄', () => {
    store.create({
      name: 'job-test',
      description: 'check logs',
      schedule_type: 'cron',
      schedule_value: '0 9 * * *',
      prompt: 'Vérifie les logs',
      delivery_mode: 'announce',
      delivery_target: 'chan-xxx',
    });

    const summary = store.activeSummary();
    expect(summary).toContain('🔄 Job');
    expect(summary).toContain('job-test');
  });

  it('n\'inclut pas les jobs complétés ou en pause', () => {
    store.create({
      name: 'job-paused',
      description: '',
      schedule_type: 'cron',
      schedule_value: '* * * * *',
      prompt: 'test',
      delivery_mode: 'silent',
    });
    store.pause('job-paused');

    expect(store.activeSummary()).toBe('');
  });
});

// ─── parseCommand : !reminders et !annuler ────────────────────────────────────

describe('parseCommand — !reminders et !annuler', () => {
  it('parse !reminders', () => {
    const cmd = parseCommand('!reminders');
    expect(cmd).toEqual({ type: 'reminders-list' });
  });

  it('parse !annuler <id>', () => {
    const cmd = parseCommand('!annuler 5');
    expect(cmd).toEqual({ type: 'reminder-cancel', id: 5 } satisfies ReminderCancelCommand);
  });

  it('lève ParseError pour !annuler sans id', () => {
    expect(() => parseCommand('!annuler')).toThrow(ParseError);
  });

  it('lève ParseError pour !annuler avec id invalide', () => {
    expect(() => parseCommand('!annuler abc')).toThrow(ParseError);
    expect(() => parseCommand('!annuler 0')).toThrow(ParseError);
  });

  it('retourne null pour un texte ordinaire', () => {
    expect(parseCommand('rappelle-moi quelque chose')).toBeNull();
  });
});

// ─── handleCommand : !reminders et !annuler ───────────────────────────────────

describe('handleCommand — !reminders et !annuler', () => {
  let db: Database.Database;
  let store: SchedulerStore;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(MIGRATION);
    store = new SchedulerStore(db);
  });

  afterEach(() => {
    db.close();
  });

  it('!reminders — retourne "Aucun rappel actif" si vide', async () => {
    const result = await handleCommand({ type: 'reminders-list' }, { store });
    expect(result).toBe('Aucun rappel actif.');
  });

  it('!reminders — liste les rappels actifs', async () => {
    const futureDate = new Date(Date.now() + 3_600_000).toISOString();
    store.create({
      name: 'remind-test',
      description: 'prendre mes médicaments',
      schedule_type: 'once',
      schedule_value: futureDate,
      prompt: '',
      delivery_mode: 'direct',
      delivery_target: 'chan-123',
    });
    const result = await handleCommand({ type: 'reminders-list' }, { store });
    expect(result).toContain('prendre mes médicaments');
    expect(result).toContain('#');
  });

  it('!reminders — n\'affiche pas les jobs !schedule (announce/silent)', async () => {
    store.create({
      name: 'job-cron',
      description: '',
      schedule_type: 'cron',
      schedule_value: '0 9 * * *',
      prompt: 'Bonjour',
      delivery_mode: 'announce',
      delivery_target: 'chan-x',
    });
    const result = await handleCommand({ type: 'reminders-list' }, { store });
    expect(result).toBe('Aucun rappel actif.');
  });

  it('!annuler — annule un rappel actif', async () => {
    const futureDate = new Date(Date.now() + 3_600_000).toISOString();
    const job = store.create({
      name: 'remind-annuler',
      description: 'test annulation',
      schedule_type: 'once',
      schedule_value: futureDate,
      prompt: '',
      delivery_mode: 'direct',
      delivery_target: 'chan-123',
    });

    const result = await handleCommand(
      { type: 'reminder-cancel', id: job.id } satisfies ReminderCancelCommand,
      { store },
    );
    expect(result).toMatch(/✅ Rappel #\d+ annulé/);
    expect(store.getById(job.id)).toBeNull();
  });

  it('!annuler — erreur si ID introuvable', async () => {
    const result = await handleCommand({ type: 'reminder-cancel', id: 999 }, { store });
    expect(result).toContain('introuvable');
  });

  it('!annuler — erreur si c\'est un job planifié (pas un rappel)', async () => {
    const job = store.create({
      name: 'job-cron',
      description: '',
      schedule_type: 'cron',
      schedule_value: '0 9 * * *',
      prompt: 'Bonjour',
      delivery_mode: 'announce',
      delivery_target: 'chan-x',
    });

    const result = await handleCommand({ type: 'reminder-cancel', id: job.id }, { store });
    expect(result).toContain('❌');
    expect(result).toContain('!schedule remove');
  });
});
