import { describe, it, expect } from 'vitest';
import { buildPrompt } from '../prompt-builder.js';
import { ConversationHistory } from '../history.js';

describe('buildPrompt', () => {
  it('includes soul, mind, personality layers', () => {
    const history = new ConversationHistory();
    const prompt = buildPrompt({
      message: 'salut',
      senderName: 'benjamin',
      channelId: 'ch1',
      history,
    });

    expect(prompt).toContain('Claw CLI');
    expect(prompt).toContain('Loyauté');
    expect(prompt).toContain('Discipline');
    expect(prompt).toContain('Personnalité');
    expect(prompt).toContain('Message de @benjamin');
    expect(prompt).toContain('salut');
  });

  it('includes conversation history when present', () => {
    const history = new ConversationHistory();
    history.add('ch1', { role: 'user', sender: 'ben', content: 'hey', timestamp: Date.now() });
    history.add('ch1', { role: 'assistant', sender: 'claw-cli', content: 'yo', timestamp: Date.now() });

    const prompt = buildPrompt({
      message: 'quoi de neuf ?',
      senderName: 'ben',
      channelId: 'ch1',
      history,
    });

    expect(prompt).toContain('@ben: hey');
    expect(prompt).toContain('Claw CLI: yo');
    expect(prompt).toContain('quoi de neuf');
  });

  it('works without history', () => {
    const history = new ConversationHistory();
    const prompt = buildPrompt({
      message: 'test',
      senderName: 'benjamin',
      channelId: 'ch1',
      history,
    });

    // Should not contain history header
    expect(prompt).not.toContain('Historique récent');
    expect(prompt).toContain('test');
  });

  it('separates layers with dividers', () => {
    const history = new ConversationHistory();
    const prompt = buildPrompt({
      message: 'x',
      senderName: 'a',
      channelId: 'ch1',
      history,
    });

    expect(prompt).toContain('---');
  });

  it('contains anti-patterns', () => {
    const history = new ConversationHistory();
    const prompt = buildPrompt({
      message: 'x',
      senderName: 'a',
      channelId: 'ch1',
      history,
    });

    expect(prompt).toContain('Désolé pour la confusion');
    expect(prompt).toContain('Bonne question');
  });

  it('layers appear in correct order: soul before mind before personality', () => {
    const history = new ConversationHistory();
    const prompt = buildPrompt({
      message: 'test',
      senderName: 'a',
      channelId: 'ch1',
      history,
    });

    const soulIdx = prompt.indexOf('Valeurs fondamentales');
    const mindIdx = prompt.indexOf('Discipline');
    const personalityIdx = prompt.indexOf('Personnalité');
    const messageIdx = prompt.indexOf('Message de @a');

    expect(soulIdx).toBeLessThan(mindIdx);
    expect(mindIdx).toBeLessThan(personalityIdx);
    expect(personalityIdx).toBeLessThan(messageIdx);
  });

  it('message is always the last block', () => {
    const history = new ConversationHistory();
    history.add('ch1', { role: 'user', sender: 'x', content: 'old', timestamp: Date.now() });

    const prompt = buildPrompt({
      message: 'nouveau message',
      senderName: 'ben',
      channelId: 'ch1',
      history,
    });

    const historyIdx = prompt.indexOf('Historique récent');
    const messageIdx = prompt.indexOf('Message de @ben');
    expect(historyIdx).toBeLessThan(messageIdx);
    // Message is after the last divider
    const lastDivider = prompt.lastIndexOf('---');
    expect(messageIdx).toBeGreaterThan(lastDivider);
  });

  it('prompt contains all essential identity elements', () => {
    const history = new ConversationHistory();
    const prompt = buildPrompt({
      message: 'x',
      senderName: 'a',
      channelId: 'ch1',
      history,
    });

    // Soul essentials
    expect(prompt).toContain('Claw CLI');
    expect(prompt).toContain('owner');
    expect(prompt).toContain('Honnêteté');
    expect(prompt).toContain('Autonomie');

    // Mind essentials
    expect(prompt).toContain('Substance > performance');
    expect(prompt).toContain('Concis');

    // Personality essentials
    expect(prompt).toContain('collègue');
    expect(prompt).toContain('tutoies');
  });
});
