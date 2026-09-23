/**
 * Resend sınıflaması — sözlük §2.4'ten ÖLÇÜLDÜ (33 kod).
 * Sınıf yanlış kurulursa geliştirici `SEND_FAILED`'dan yanlış yolla çıkmaya çalışır.
 */
import { describe, it, expect } from 'vitest';
import { resendClassOf, RESEND_CLASS_CODES, ETTN_BURNED_CODES } from './resend-class.js';

describe('resend sınıflaması', () => {
  it('SSOT 33 kod taşır (sözlük §2.4)', () => {
    const total =
      RESEND_CLASS_CODES.A.length + RESEND_CLASS_CODES.B.length + RESEND_CLASS_CODES.C.length;
    expect(total).toBe(33);
  });

  it('hiçbir kod iki sınıfta birden değil', () => {
    const all = [...RESEND_CLASS_CODES.A, ...RESEND_CLASS_CODES.B, ...RESEND_CLASS_CODES.C];
    expect(new Set(all).size).toBe(all.length);
  });

  it.each([1110, 1215, 1230, 1195])('A sınıfı: %i resend uygun', (code) => {
    expect(resendClassOf(code)).toBe('A');
  });

  it.each([1150, 1160, 1161, 1176, 1177, 1140, 1143, 1181])(
    'B sınıfı: %i yeniden imza şart',
    (code) => {
      expect(resendClassOf(code)).toBe('B');
    },
  );

  it.each([1163, 1164, 1300, 1235])('C sınıfı: %i asla/bekle', (code) => {
    expect(resendClassOf(code)).toBe('C');
  });

  it('🔑 tabloda olmayan kod null → çağıran A gibi davranır (bilinçli fail-open)', () => {
    expect(resendClassOf(9999)).toBeNull();
    expect(resendClassOf(null)).toBeNull();
    expect(resendClassOf(undefined)).toBeNull();
  });

  it('ETTN yalnız 1300\'de yanar (ölçülmüş yorum)', () => {
    expect(ETTN_BURNED_CODES).toEqual([1300]);
  });

  it('🔴 1230 A sınıfıdır ama teslim geri almanın kendi yolu var (G12)', () => {
    // Sınıf ve geçiş AYRI eksenlerdir: 1230 hem terminal-fail hem resend-uygun.
    expect(resendClassOf(1230)).toBe('A');
  });
});
