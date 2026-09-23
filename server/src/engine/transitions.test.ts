/**
 * M3 ÖLÇÜSÜ (plan §9): *"her geçiş M0'da ölçülen koda karşılık geliyor mu."*
 *
 * Bu dosya geçiş tablosunu sözlük §3.1'e karşı denetler. Tablo VERİ olduğu için
 * denetim de veri karşılaştırmasıdır — "şu switch dalı doğru mu" değil.
 */
import { describe, it, expect } from 'vitest';
import {
  TRANSITIONS,
  findTransition,
  isTerminalFailCode,
  DELIVERED_GIB_CODES,
  ENVELOPE_CLOSE_CODE,
  INTERMEDIATE_CODES,
} from './transitions.js';
import { WRITABLE_DOC_STATUSES } from '../status.js';

describe('geçiş tablosu — sözlük §3.1 ile hizalı', () => {
  it('her satırın MimForge atfı var', () => {
    /*
     * Satır numarası OPSİYONELDİR ama dosya zorunludur. Tek istisna L10
     * (S_APR gönderimi): sözlük §3.2 o satır için dosya veriyor ama satır
     * numarası VERMİYOR. Uydurulmuş bir satır numarası, atfın değerini
     * götürürdü — "kaynağını gösteremediğini ölçüldü diye yazma".
     */
    for (const rule of TRANSITIONS) {
      expect(rule.source, `${rule.id}: kaynak yok`).toMatch(/^mimforge:[\w./-]+\.ts(:[\d-]+)?$/);
    }
    const withoutLine = TRANSITIONS.filter((r) => !/:\d/.test(r.source.replace('mimforge:', '')));
    expect(
      withoutLine.map((r) => r.id),
      'satır numarasız atıf yalnız L10 olabilir (sözlük de vermiyor)',
    ).toEqual(['L10']);
  });

  it('hiçbir satır ÖLÜ değere geçmiyor (sözlük §6-B)', () => {
    for (const rule of TRANSITIONS) {
      expect(WRITABLE_DOC_STATUSES, `${rule.id} → ${rule.to}`).toContain(rule.to);
      for (const from of rule.from) {
        expect(WRITABLE_DOC_STATUSES, `${rule.id} from ${from}`).toContain(from);
      }
    }
  });

  it('sözlükteki satır kimlikleri eksiksiz', () => {
    const ids = TRANSITIONS.map((r) => r.id);
    // v1 kapsamındaki giden yol: G5–G12, G15, G16. G1–G4 ingest'te (motor değil).
    // Giden yol + gelen yol (L10 damga, L11 🔑 ikinci adım).
    expect(ids).toEqual([
      'G5', 'G6', 'G7', 'G8', 'G12', 'G9', 'G10', 'G11', 'G15', 'G16',
      'L10', 'L11',
    ]);
  });

  /* ── Sözlük §9'un dört çıpası — tek tek ────────────────────────────────── */

  it('🔑 çıpa: 1220 BİRİNCİL teslim kodudur', () => {
    expect(DELIVERED_GIB_CODES).toEqual([1220]);
    const rule = findTransition({ from: 'SENT_TO_GIB', event: 'poll', rawGibCode: 1220 });
    expect(rule?.id).toBe('G9');
    expect(rule?.to).toBe('DELIVERED');
    expect(rule?.deliveredAt).toBe('set');
  });

  it('🔑 çıpa: 1300 zarf kapanışıdır, teslim için yalnız FALLBACK', () => {
    expect(ENVELOPE_CLOSE_CODE).toBe(1300);
    const rule = findTransition({ from: 'PROCESSING', event: 'poll', rawGibCode: 1300 });
    expect(rule?.id).toBe('G10');
    // 1300 DELIVERED'a götürür ama 1220 zaten geldiyse belge DELIVERED'dadır ve
    // o durumdan 1300 için kural YOKTUR → no-op (durum değişmez).
    expect(findTransition({ from: 'DELIVERED', event: 'poll', rawGibCode: 1300 })).toBeNull();
  });

  it('🔴 çıpa: 1230 teslimi GERİ ALIR ve yalnız DELIVERED\'dan', () => {
    const revoke = findTransition({ from: 'DELIVERED', event: 'poll', rawGibCode: 1230 });
    expect(revoke?.id).toBe('G12');
    expect(revoke?.to).toBe('SEND_FAILED');
    expect(revoke?.deliveredAt).toBe('clear');
    expect(revoke?.alarm).toBe('DOCUMENT_DELIVERY_REVOKED');
  });

  it('🔴 SIRA: 1230 teslim edilmemiş belgede G11 (düz terminal-fail) olur', () => {
    // DELIVERED değilse geri alma yolu yok; 1230 terminal-fail kümesinden gelir.
    const rule = findTransition({ from: 'SENT_TO_GIB', event: 'poll', rawGibCode: 1230 });
    expect(rule?.id).toBe('G11');
    expect(rule?.deliveredAt).toBeUndefined();
  });

  it('terminal-fail kümesi ölçülen tanımla birebir', () => {
    // isTerminalFailCode = (1110≤c≤1195) || 1215 || 1230 || 1235
    // 1164 de aralıktadır (C sınıfı olması terminal olmamasını gerektirmez —
    // resend SINIFI ayrı bir eksendir, sözlük §2.4).
    for (const code of [1110, 1150, 1164, 1195, 1215, 1230, 1235]) {
      expect(isTerminalFailCode(code), `${code} terminal olmalı`).toBe(true);
    }
    for (const code of [1000, 1100, 1109, 1196, 1200, 1210, 1220, 1300]) {
      expect(isTerminalFailCode(code), `${code} terminal OLMAMALI`).toBe(false);
    }
  });

  it('ara kodlar hiçbir durumda geçiş üretmez (yalnız poll izi)', () => {
    for (const code of INTERMEDIATE_CODES) {
      if (code === 1200 || code === 1220) continue; // bunların kendi satırı var
      for (const from of WRITABLE_DOC_STATUSES) {
        expect(
          findTransition({ from, event: 'poll', rawGibCode: code }),
          `${from} + ${code} geçiş üretmemeli`,
        ).toBeNull();
      }
    }
  });

  it('1200 yalnız PROCESSING\'den SENT_TO_GIB yapar', () => {
    expect(findTransition({ from: 'PROCESSING', event: 'poll', rawGibCode: 1200 })?.id).toBe('G8');
    // Zaten SENT_TO_GIB'de ise tekrar 1200 gelmesi durumu değiştirmez.
    expect(findTransition({ from: 'SENT_TO_GIB', event: 'poll', rawGibCode: 1200 })).toBeNull();
  });

  it('CAS guard: teslim edilmiş belge geç gelen terminal koddan etkilenmez', () => {
    // Sözlük: "geç gelen 1215 bir DELIVERED'ı ASLA ezemez".
    expect(findTransition({ from: 'DELIVERED', event: 'poll', rawGibCode: 1215 })).toBeNull();
  });

  it('SEND_FAILED terminal DEĞİL — resend yolu açık', () => {
    expect(findTransition({ from: 'SEND_FAILED', event: 'resend' })?.to).toBe('PROCESSING');
  });

  it('imza yolu: iki giriş durumundan da PROCESSING\'e', () => {
    expect(findTransition({ from: 'RECEIVED', event: 'sign' })?.id).toBe('G5');
    expect(findTransition({ from: 'AWAITING_SIGNATURE', event: 'sign' })?.id).toBe('G6');
  });

  it('🔴 belge düzleminde FAILED\'a giden HİÇBİR yol yok (sözlük §6-B)', () => {
    for (const rule of TRANSITIONS) {
      expect(rule.to).not.toBe('FAILED');
      expect(rule.to).not.toBe('SENT');
      expect(rule.to).not.toBe('SENT_TO_RECEIVER');
    }
  });
});
