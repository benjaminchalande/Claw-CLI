import { describe, it, expect } from 'vitest';
import { parseReminderMessage, formatReminderEta } from '../commands/reminderParser.js';

// Heure de référence fixe pour les tests
const NOW = new Date('2026-04-06T10:00:00.000Z');

// ─── parseReminderMessage ─────────────────────────────────────────────────────

describe('parseReminderMessage', () => {
  describe('retourne null si le message ne ressemble pas à un reminder', () => {
    it('message ordinaire', () => {
      expect(parseReminderMessage('bonjour comment ça va', NOW)).toBeNull();
    });

    it('message vide', () => {
      expect(parseReminderMessage('', NOW)).toBeNull();
    });

    it('commence par rappel (pas rappelle-moi)', () => {
      expect(parseReminderMessage('rappel médecin demain', NOW)).toBeNull();
    });
  });

  // ─── Pattern : dans N unités ────────────────────────────────────────────────

  describe('pattern : "dans N unités"', () => {
    it('dans 2h', () => {
      const r = parseReminderMessage('rappelle-moi de prendre mes médicaments dans 2h', NOW);
      expect(r).not.toBeNull();
      expect(r!.message).toBe('prendre mes médicaments');
      expect(r!.when).toEqual(new Date('2026-04-06T12:00:00.000Z'));
    });

    it('dans 30 minutes', () => {
      const r = parseReminderMessage('rappelle-moi de checker les logs dans 30 minutes', NOW);
      expect(r).not.toBeNull();
      expect(r!.message).toBe('checker les logs');
      expect(r!.when).toEqual(new Date('2026-04-06T10:30:00.000Z'));
    });

    it('dans 1 jour', () => {
      const r = parseReminderMessage('rappelle-moi de faire le backup dans 1 jour', NOW);
      expect(r).not.toBeNull();
      expect(r!.message).toBe('faire le backup');
      expect(r!.when).toEqual(new Date('2026-04-07T10:00:00.000Z'));
    });

    it('dans 45 secondes', () => {
      const r = parseReminderMessage('rappelle-moi de fermer le four dans 45 secondes', NOW);
      expect(r).not.toBeNull();
      expect(r!.message).toBe('fermer le four');
      expect(r!.when).toEqual(new Date('2026-04-06T10:00:45.000Z'));
    });

    it('dans 1h et 30 minutes', () => {
      const r = parseReminderMessage('rappelle-moi de la réunion dans 1h et 30 minutes', NOW);
      expect(r).not.toBeNull();
      expect(r!.message).toBe('la réunion');
      // 1h30 = 5400s
      expect(r!.when).toEqual(new Date(NOW.getTime() + 5_400_000));
    });

    it('virgule pour décimaux : 0,5h', () => {
      const r = parseReminderMessage('rappelle-moi de sortir le chien dans 0,5 heure', NOW);
      expect(r).not.toBeNull();
      // 0.5h = 1800s
      expect(r!.when).toEqual(new Date(NOW.getTime() + 1_800_000));
    });

    it('sans "de" : rappelle-moi X dans 2h', () => {
      const r = parseReminderMessage("rappelle-moi l'appel dans 2h", NOW);
      expect(r).not.toBeNull();
      expect(r!.message).toBe("l'appel");
    });

    it('avec apostrophe : rappelle-moi d\'acheter dans 1h', () => {
      const r = parseReminderMessage("rappelle-moi d'acheter du pain dans 1h", NOW);
      expect(r).not.toBeNull();
      expect(r!.message).toBe('acheter du pain');
    });
  });

  // ─── Pattern : demain à HH:MM ────────────────────────────────────────────────

  describe('pattern : "demain à HH:MM"', () => {
    it('demain à 09:30', () => {
      const r = parseReminderMessage('rappelle-moi de faire le bilan demain à 09:30', NOW);
      expect(r).not.toBeNull();
      expect(r!.message).toBe('faire le bilan');
      expect(r!.when).toEqual(new Date('2026-04-07T09:30:00.000Z'));
    });

    it('demain à 14h', () => {
      const r = parseReminderMessage('rappelle-moi du meeting demain à 14h', NOW);
      expect(r).not.toBeNull();
      expect(r!.when).toEqual(new Date('2026-04-07T14:00:00.000Z'));
    });

    it('heure invalide rejetée (25h)', () => {
      const r = parseReminderMessage('rappelle-moi de X demain à 25h', NOW);
      expect(r).toBeNull();
    });
  });

  // ─── Pattern : à HH:MM (aujourd'hui) ────────────────────────────────────────

  describe('pattern : "à HH:MM" (aujourd\'hui ou demain)', () => {
    it('à 15h00 (dans le futur)', () => {
      const r = parseReminderMessage('rappelle-moi de quitter le bureau à 15h', NOW);
      // NOW = 10:00 UTC → 15:00 UTC aujourd'hui
      expect(r).not.toBeNull();
      expect(r!.message).toBe('quitter le bureau');
      expect(r!.when).toEqual(new Date('2026-04-06T15:00:00.000Z'));
    });

    it('à 08:00 (déjà passé → demain)', () => {
      const r = parseReminderMessage('rappelle-moi de prendre le bus à 08:00', NOW);
      // NOW = 10:00 UTC → 08:00 est passé → reporter à demain
      expect(r).not.toBeNull();
      expect(r!.when).toEqual(new Date('2026-04-07T08:00:00.000Z'));
    });

    it('à 10:30 avec minutes', () => {
      const r = parseReminderMessage('rappelle-moi de la pause café à 10:30', NOW);
      expect(r).not.toBeNull();
      expect(r!.when).toEqual(new Date('2026-04-06T10:30:00.000Z'));
    });

    it('heure invalide rejetée (minutes > 59)', () => {
      const r = parseReminderMessage('rappelle-moi de X à 10:99', NOW);
      expect(r).toBeNull();
    });
  });

  // ─── Casse ──────────────────────────────────────────────────────────────────

  describe('insensibilité à la casse', () => {
    it('RAPPELLE-MOI majuscules', () => {
      const r = parseReminderMessage('RAPPELLE-MOI de faire X dans 1h', NOW);
      expect(r).not.toBeNull();
    });

    it('Rappelle-Moi mixed case', () => {
      const r = parseReminderMessage('Rappelle-Moi de faire Y dans 30 Minutes', NOW);
      expect(r).not.toBeNull();
    });
  });
});

// ─── formatReminderEta ────────────────────────────────────────────────────────

describe('formatReminderEta', () => {
  const NOW2 = new Date('2026-04-06T10:00:00.000Z');

  it('dans quelques secondes', () => {
    const when = new Date(NOW2.getTime() + 30_000);
    expect(formatReminderEta(when, NOW2)).toContain('30s');
  });

  it('dans 2 heures', () => {
    const when = new Date(NOW2.getTime() + 2 * 3_600_000);
    expect(formatReminderEta(when, NOW2)).toContain('2h');
    expect(formatReminderEta(when, NOW2)).toContain('12:00');
  });

  it('dans 1h30', () => {
    const when = new Date(NOW2.getTime() + 90 * 60_000);
    const eta = formatReminderEta(when, NOW2);
    expect(eta).toContain('1h');
    expect(eta).toContain('30min');
  });

  it('passé → "maintenant"', () => {
    const when = new Date(NOW2.getTime() - 1000);
    expect(formatReminderEta(when, NOW2)).toBe('maintenant');
  });

  it('demain → label "demain" dans l\'eta', () => {
    const when = new Date('2026-04-07T09:00:00.000Z');
    const eta = formatReminderEta(when, NOW2);
    expect(eta).toContain('demain');
  });
});
