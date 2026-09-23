/**
 * JSON ana yolu (plan K1) — `POST /v1/documents`.
 *
 * Bu yol json2ubl-ts ile UBL üretir; üretilen belge CANLI şematrondan geçmek
 * ZORUNDADIR. Geçmiyorsa mock geliştiriciye üretemeyeceği bir şeyi vaat ediyor
 * demektir — bu testin asıl işi o vaadi ölçmektir.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startTestApp, testMimkitEnv, LIVE_REQUIRED, type TestApp } from '../test-support.js';
import { SEED_TENANT_API_KEY } from '../seed.js';

const liveEnv = testMimkitEnv();

/** Şekil ölçüldü: json2ubl-ts examples-matrix valid/…/input.ts (SimpleInvoiceInput). */
function simpleInvoice(overrides?: Record<string, unknown>) {
  return {
    id: 'ORN2026000000201',
    uuid: randomUUID(),
    datetime: '2026-04-24T10:00:00',
    profile: 'TEMELFATURA',
    type: 'SATIS',
    currencyCode: 'TRY',
    sender: {
      taxNumber: '1111111111',
      name: 'DENEME GÖNDERİCİ A.Ş.',
      taxOffice: 'DENEME VERGİ DAİRESİ',
      address: 'Deneme Mah. No:1',
      district: 'Çankaya',
      city: 'Ankara',
    },
    customer: {
      taxNumber: '2222222222',
      name: 'DENEME ALICI LTD. ŞTİ.',
      taxOffice: 'DENEME VERGİ DAİRESİ',
      address: 'Deneme Cad. No:2',
      district: 'Kadıköy',
      city: 'İstanbul',
    },
    lines: [{ name: 'Deneme hizmeti', quantity: 1, price: 1000, unitCode: 'Adet', kdvPercent: 20 }],
    ...overrides,
  };
}

describe('JSON ana yolu (K1)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await startTestApp({ env: { ...liveEnv } });
  });
  afterAll(async () => {
    await ctx?.close();
  });

  const headers = { authorization: `Bearer ${SEED_TENANT_API_KEY}`, 'x-company': '1111111111' };

  it('mimkit bağlı (canlı ölçüm gerekli)', () => {
    expect(liveEnv, `${LIVE_REQUIRED}`).toBeTruthy();
    expect(ctx.kittestReady).toBe(true);
  });

  it('🔑 json2ubl-ts çıktısı CANLI şematrondan geçer → 202', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/v1/documents',
      headers,
      payload: simpleInvoice(),
    });
    if (response.statusCode !== 202) {
      const body = response.json();
      throw new Error(
        `JSON yolu reddedildi (${response.statusCode} ${body.errorCode}): ${body.reason}\n` +
          (body.errors ?? [])
            .map((e: { field: string; reason: string }) => `  - ${e.field}: ${e.reason}`)
            .join('\n'),
      );
    }
    expect(response.json().ettn).toBeTruthy();
  });

  it('JSON yolu ile UBL yolu AYNI kaynağı doğurur (K1)', async () => {
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/v1/documents',
      headers,
      payload: simpleInvoice({ id: 'ORN2026000000202' }),
    });
    expect(created.statusCode).toBe(202);

    const read = await ctx.app.inject({
      method: 'GET',
      url: `/v1/documents/${created.json().id}`,
      headers: { authorization: `Bearer ${SEED_TENANT_API_KEY}` },
    });
    const doc = read.json();
    expect(doc.sourceKind).toBe('json');
    expect(doc.type).toBe('EFATURA');
    expect(doc.documentNumber).toBe('ORN2026000000202');
    expect(doc.payableAmount).toBe('1200.00');

    // Üretilen UBL geri alınabilir — geliştirici ne gönderdiğini ve ne üretildiğini görür.
    const xml = await ctx.app.inject({
      method: 'GET',
      url: `/v1/documents/${created.json().id}/xml`,
      headers: { authorization: `Bearer ${SEED_TENANT_API_KEY}` },
    });
    expect(xml.body).toContain('<cbc:ProfileID>TEMELFATURA</cbc:ProfileID>');
  });

  it('KAPI: json2ubl-ts reddederse 400 JSON_BUILD_FAILED', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/v1/documents',
      headers,
      // KDV 0 ama istisna kodu yok — kütüphanenin kendi kapısı (manuel istisna).
      payload: simpleInvoice({
        id: 'ORN2026000000203',
        lines: [{ name: 'Deneme', quantity: 1, price: 100, unitCode: 'Adet', kdvPercent: 0 }],
      }),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().errorCode).toBe('JSON_BUILD_FAILED');
  });

  it('KAPI: gövde nesne değilse 400 VALIDATION_FAILED', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/v1/documents',
      headers,
      payload: [1, 2, 3],
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().errorCode).toBe('VALIDATION_FAILED');
  });

  it('KAPI: JSON yolunda da sicil kapısı işler (RECEIVER_NOT_REGISTERED)', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/v1/documents',
      headers,
      payload: simpleInvoice({
        id: 'ORN2026000000204',
        customer: {
          taxNumber: '7777777777',
          name: 'DENEME TANIMSIZ A.Ş.',
          taxOffice: 'DENEME VERGİ DAİRESİ',
          address: 'Deneme Cad. No:9',
          district: 'Kadıköy',
          city: 'İstanbul',
        },
      }),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().errorCode).toBe('RECEIVER_NOT_REGISTERED');
  });
});
