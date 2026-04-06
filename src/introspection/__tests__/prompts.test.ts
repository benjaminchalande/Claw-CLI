import { describe, it, expect } from 'vitest';
import {
  MEMORIZE_PROMPT,
  CONSOLIDATE_PROMPT,
  REFLECT_PROMPT,
  STATUS_REPORT_PROMPT,
  ROADMAP_SYNC_PROMPT,
} from '../prompts.js';

describe('Introspection prompts', () => {
  const prompts = [
    { name: 'MEMORIZE', prompt: MEMORIZE_PROMPT },
    { name: 'CONSOLIDATE', prompt: CONSOLIDATE_PROMPT },
    { name: 'REFLECT', prompt: REFLECT_PROMPT },
    { name: 'STATUS_REPORT', prompt: STATUS_REPORT_PROMPT },
    { name: 'ROADMAP_SYNC', prompt: ROADMAP_SYNC_PROMPT },
  ];

  for (const { name, prompt } of prompts) {
    it(`${name} is a non-empty string`, () => {
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(50);
    });

    it(`${name} contains actionable steps`, () => {
      // Each prompt should have numbered steps
      expect(prompt).toMatch(/\d+\./);
    });
  }

  it('MEMORIZE references memory CLI', () => {
    expect(MEMORIZE_PROMPT).toContain('src/memory/cli.ts');
  });

  it('CONSOLIDATE references memory list', () => {
    expect(CONSOLIDATE_PROMPT).toContain('src/memory/cli.ts');
  });

  it('REFLECT references roadmap', () => {
    expect(REFLECT_PROMPT).toContain('docs/roadmap');
  });

  it('ROADMAP_SYNC checks file existence', () => {
    expect(ROADMAP_SYNC_PROMPT).toContain('docs/roadmap');
    expect(ROADMAP_SYNC_PROMPT).toContain('00-overview.md');
  });
});
