/**
 * NUMARASIZ belge yolu — uçtan uca, CANLI numaratör + CANLI şematron.
 *
 * MimForge deseni (sözlük §3.1 G3→G4):
 *   numarasız + imzasız → `AWAITING_NUMBERING` → mimkit reserve + `cbc:ID` göm
 *   → `AWAITING_SIGNATURE`
 *
 * Mock numarayı ingest anında alır (motor M3'te devreye girene dek tek adım),
 * ama numaranın KAYNAĞI gerçektir ve belgeye GÖMÜLÜR — gömülmezse saklanan
 * belge ile verilen numara ayrışır ve bu sessiz bir yalan olurdu.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startTestApp, testMimkitEnv, LIVE_REQUIRED, type TestApp } from '../test-support.js';
import { SEED_TENANT_API_KEY } from '../seed.js';

const FIXTURE = join(
  import.meta.dirname,
  '../__fixtures__/fidelity/accept/EFATURA-01-temel-satis.xml',
);
const liveEnv = testMimkitEnv();
const mimkitUrl = process.env.MIMMOCK_TEST_MIMKIT_URL;
const mimkitToken = process.env.MIMMOCK_TEST_MIMKIT_TOKEN;

/** Fikstürden `cbc:ID`'yi söker — numarasız belge üretir. */
function unnumberedXml(): string {
  return readFileSync(FIXTURE, 'utf8')
    .replace(/<cbc:UUID>[^<]*<\/cbc:UUID>/, `<cbc:UUID>${randomUUID()}</cbc:UUID>`)
    .replace(/\s*<cbc:ID>[^<]*<\/cbc:ID>/, '');
}

describe('numarasız belge yolu (canlı numaratör)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    expect(liveEnv, `${LIVE_REQUIRED}`).toBeTruthy();
    expect(mimkitUrl, 'MIMMOCK_TEST_MIMKIT_URL gerekli — numaratör ölçülmeden yeşil sayılmaz').toBeTruthy();
    ctx = await startTestApp({
      env: {
        MIMMOCK_MIMKIT_URL: mimkitUrl,
        MIMMOCK_MIMKIT_TOKEN: mimkitToken,
        MIMMOCK_MIMKIT_SCOPE_ID: `mimmock-e2e-${process.env.MIMMOCK_TEST_SCOPE ?? 'local'}`,
      },
    });
  });
  afterAll(async () => {
    await ctx?.close();
  });

  const headers = (extra?: Record<string, string>) => ({
    authorization: `Bearer ${SEED_TENANT_API_KEY}`,
    'x-company': '1111111111',
    'content-type': 'application/xml',
    ...extra,
  });

  it('numarasız belge kabul edilir ve GERÇEK numara alır', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/v1/documents/ubl',
      headers: headers({ 'x-series-prefix': 'MME' }),
      payload: unnumberedXml(),
    });
    if (response.statusCode !== 202) {
      const body = response.json();
      throw new Error(`reddedildi (${response.statusCode} ${body.errorCode}): ${body.reason}`);
    }

    const read = await ctx.app.inject({
      method: 'GET',
      url: `/v1/documents/${response.json().id}`,
      headers: { authorization: `Bearer ${SEED_TENANT_API_KEY}` },
    });
    const doc = read.json();

    // Numara mimkit'ten geldi ve MimForge biçimine uyuyor.
    expect(doc.documentNumber).toMatch(/^MME20\d{2}\d{9}$/);

    // 🔑 Numara BELGEYE de gömüldü — saklanan UBL ile kayıt ayrışmıyor.
    const xml = await ctx.app.inject({
      method: 'GET',
      url: `/v1/documents/${response.json().id}/xml`,
      headers: { authorization: `Bearer ${SEED_TENANT_API_KEY}` },
    });
    expect(xml.body).toContain(`<cbc:ID>${doc.documentNumber}</cbc:ID>`);
  });

  it('🔑 gömülen numaralı belge CANLI şematrondan da geçer', async () => {
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/v1/documents/ubl',
      headers: headers({ 'x-series-prefix': 'MME' }),
      payload: unnumberedXml(),
    });
    expect(created.statusCode).toBe(202);

    const xml = await ctx.app.inject({
      method: 'GET',
      url: `/v1/documents/${created.json().id}/xml`,
      headers: { authorization: `Bearer ${SEED_TENANT_API_KEY}` },
    });

    // Gömme sonrası belgeyi referans doğrulayıcıya sor: element sırası bozulmuş
    // olsaydı burada görünürdü (M2'de korpusun 11 dosyasını düşüren hata sınıfı).
    const { createValidator } = await import('../kittest/validate.js');
    const reference = createValidator({
      url: liveEnv!.MIMMOCK_MIMKIT_URL,
      token: liveEnv!.MIMMOCK_MIMKIT_TOKEN,
      timeoutMs: 30000,
    });
    const verdict = await reference.validate(xml.body, {
      type: 'efatura',
      profile: 'unsigned-invoice',
    });
    expect(
      { schema: verdict.validSchema, schematron: verdict.validSchematron },
      `gömme sonrası doğrulama düştü: ${JSON.stringify(verdict.schemaErrors)}`,
    ).toEqual({ schema: true, schematron: true });
  });

  it('KAPI: seri öneki yoksa 409 NO_DEFAULT_SERIES', async () => {
    // Tohum şirket 1111111111'in seriesPrefix'i var; onu kullanmayan bir şirket kur.
    await ctx.repo.insertCompany({
      id: 'co_noseries',
      tenantId: 'tn_seed',
      vkn: '8888888888',
      title: 'DENEME SERİSİZ A.Ş.',
      addressCountry: 'Türkiye',
      addressStreet: null, addressDistrict: null, addressCity: null, taxOffice: null,
      pkAliases: [], gbAliases: [], profiles: [],
      templateId: null, seriesPrefix: null, eInvoiceRegistered: true,
    });
    const xml = unnumberedXml().replace(/1111111111/g, '8888888888');
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/v1/documents/ubl',
      headers: headers({ 'x-company': '8888888888' }),
      payload: xml,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().errorCode).toBe('NO_DEFAULT_SERIES');
  });

  it('KAPI: numaralı belgede seri öneki gönderilemez (SERIES_PREFIX_NOT_APPLICABLE)', async () => {
    const numbered = readFileSync(FIXTURE, 'utf8').replace(
      /<cbc:UUID>[^<]*<\/cbc:UUID>/,
      `<cbc:UUID>${randomUUID()}</cbc:UUID>`,
    );
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/v1/documents/ubl',
      headers: headers({ 'x-series-prefix': 'MME' }),
      payload: numbered,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().errorCode).toBe('SERIES_PREFIX_NOT_APPLICABLE');
  });
});
