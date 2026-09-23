/**
 * Hata kataloğunun kaynak disiplini.
 * "Kaynağını gösteremediğin bir şeyi ölçüldü diye yazma" kuralının bekçisi.
 */
import { describe, it, expect } from 'vitest';
import { ERROR_CATALOG, MimMockError } from './errors.js';

describe('hata kataloğu', () => {
  it('her kodun kaynağı var ve iki biçimden birine uyuyor', () => {
    for (const [code, def] of Object.entries(ERROR_CATALOG)) {
      const ok = def.source === 'mimmock' || /^mimforge:[\w./-]+\.ts:\d+$/.test(def.source);
      expect(ok, `${code}: geçersiz kaynak "${def.source}"`).toBe(true);
    }
  });

  it('kodlar İngilizce ve KARARLI, gerekçeler Türkçe (plan K10)', () => {
    for (const [code, def] of Object.entries(ERROR_CATALOG)) {
      expect(code, `${code}: kod SCREAMING_SNAKE ve ASCII olmalı`).toMatch(/^[A-Z][A-Z0-9_]*$/);
      expect(def.reason.length, `${code}: gerekçe boş`).toBeGreaterThan(0);
    }
  });

  it('gövde şekli errorCode + reason (sözlük §9-8)', () => {
    const body = new MimMockError('INVALID_VKN').toBody();
    expect(Object.keys(body).sort()).toEqual(['errorCode', 'reason']);
    expect(body.errorCode).toBe('INVALID_VKN');
  });

  it('alan hataları errors[] ile taşınır', () => {
    const body = new MimMockError('VALIDATION_FAILED', {
      errors: [{ field: 'title', reason: 'Unvan zorunlu.' }],
    }).toBody();
    expect(body.errors).toHaveLength(1);
  });

  it('ölçülmüş kodların HTTP durumu MimForge ölçümüyle aynı', () => {
    // Sözlük §4.2/§4.4'ten birebir.
    expect(ERROR_CATALOG.BRANCH_REQUIRED.status).toBe(400);
    expect(ERROR_CATALOG.CONTEXT.status).toBe(404);
    expect(ERROR_CATALOG.FORBIDDEN.status).toBe(403);
    expect(ERROR_CATALOG.INVALID_VKN.status).toBe(400);
  });
});
