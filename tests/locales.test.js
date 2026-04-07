import { describe, expect, it } from 'vitest';
import { createTranslator } from '../src/core/locales.js';

describe('locales', () => {
  it('returns bilingual app titles', () => {
    const en = createTranslator('en');
    const zh = createTranslator('zh-TW');

    expect(en('app.title')).toBe('Local AI Operator');
    expect(en('app.subtitle')).toBe('本機 AI 操作台');
    expect(zh('app.title')).toBe('本機 AI 操作台');
    expect(zh('app.subtitle')).toBe('Local AI Operator');
  });

  it('falls back to English when keys are missing', () => {
    const t = createTranslator('zh-TW');
    expect(t('labels.write')).toBe('寫入');
    expect(t('missing.key')).toBe('missing.key');
  });
});
