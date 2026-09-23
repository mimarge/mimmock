/**
 * Public depo kapı 4 (plan §2b) — örnek korpus SENTETİK kimlik taşımalı.
 *
 * Bu kapı ağ istemez, bu yüzden CANLI sadakat testinden AYRI dosyada durur ve
 * her koşumda çalışır. Kapının yeri belge değil TEST'tir: korpusa sentetik
 * olmayan bir kimlik girerse burası kırmızıya döner.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ACCEPT_DIR = join(import.meta.dirname, '__fixtures__/fidelity/accept');
const acceptFiles = readdirSync(ACCEPT_DIR).filter((f) => f.endsWith('.xml'));

/** Sentetik kimlik: tek rakamın tekrarı (1111111111, 33333333333 …). */
const SYNTHETIC_TAX_ID = /^(\d)\1{9,10}$/;
const SYNTHETIC_NAME = /DENEME|ÖRNEK|ORNEK|NUMUNE|EXAMPLE/i;

describe('public depo kapı 4 — örnek korpus sentetik kimlik taşır (plan §2b)', () => {
  it('korpus boş değil', () => {
    expect(acceptFiles.length).toBe(15);
  });

  it.each(acceptFiles)('%s: bütün VKN/TCKN değerleri sentetik', (file) => {
    const xml = readFileSync(join(ACCEPT_DIR, file), 'utf8');
    const ids = [...xml.matchAll(/schemeID="(?:VKN|TCKN)">([^<]*)/g)].map((m) => m[1] ?? '');
    expect(ids.length, 'belgede hiç VKN/TCKN yok').toBeGreaterThan(0);
    for (const id of ids) {
      expect(SYNTHETIC_TAX_ID.test(id), `sentetik olmayan kimlik: ${id}`).toBe(true);
    }
  });

  it.each(acceptFiles)('%s: taraf adları sentetik damga taşır', (file) => {
    const xml = readFileSync(join(ACCEPT_DIR, file), 'utf8');
    // ⚠️ `cbc:Name` UBL'de her yerde geçer (banka şubesi, vergi dairesi, ürün adı).
    // Kimlik kapısı YALNIZ `cac:PartyName` içindeki taraf adlarını ölçmeli; daha
    // geniş bir süzgeç ("Kızılay Kurumsal Şubesi") sahte kırmızı üretiyordu.
    const partyNames = [...xml.matchAll(/<cac:PartyName>\s*<cbc:Name>([^<]*)</g)].map(
      (m) => m[1] ?? '',
    );
    expect(partyNames.length, 'taraf adı bulunamadı').toBeGreaterThan(0);
    for (const name of partyNames) {
      expect(SYNTHETIC_NAME.test(name), `sentetik damgasız taraf adı: ${name}`).toBe(true);
    }
  });
});

