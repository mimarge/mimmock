/**
 * Ölü değer bekçisi — sözlük §6-B / §9-3.
 * "Yardımcın hedefini bulamazsa FIRLATSIN" kuralının somut hâli.
 */
import { describe, it, expect } from 'vitest';
import {
  DOC_STATUSES,
  WRITABLE_DOC_STATUSES,
  assertWritableStatus,
  SCHEMATRON_TYPE_BY_DOC_TYPE,
  DOCUMENT_TYPES,
} from './status.js';

describe('durum sözlüğü', () => {
  it('12 belge durumu taşır (sözlük §1.1)', () => {
    expect(DOC_STATUSES).toHaveLength(12);
  });

  it.each(['SENT', 'FAILED', 'SENT_TO_RECEIVER'])(
    'ölü değer %s sözlükte TANINIR ama YAZILAMAZ',
    (dead) => {
      expect(DOC_STATUSES).toContain(dead);
      expect(WRITABLE_DOC_STATUSES).not.toContain(dead);
      expect(() => assertWritableStatus(dead)).toThrow(/Ölü\/bilinmeyen/);
    },
  );

  it('bilinmeyen durum da fırlatır (sessiz geçiş yok)', () => {
    expect(() => assertWritableStatus('UYDURMA_DURUM')).toThrow();
  });

  it.each([...WRITABLE_DOC_STATUSES])('yazılabilir durum %s geçer', (status) => {
    expect(assertWritableStatus(status)).toBe(status);
  });

  it('şematron tip ipuçları KÜÇÜK harf (canlı sonda: büyük harf 400 veriyor)', () => {
    for (const type of DOCUMENT_TYPES) {
      const hint = SCHEMATRON_TYPE_BY_DOC_TYPE[type];
      if (hint === undefined) continue;
      expect(hint, `${type} ipucu küçük harf olmalı`).toBe(hint.toLowerCase());
    }
  });

  it('EMM için ipucu GÖNDERİLMEZ (CreditNote kökü — ölçüldü)', () => {
    expect(SCHEMATRON_TYPE_BY_DOC_TYPE.EMM).toBeUndefined();
  });
});
