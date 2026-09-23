/**
 * İngest kapıları — her kapı BOZUK GİRDİYLE sınanır.
 *
 * Kapı sırası sözlük §4.2'den normatiftir; testler o sırayı da doğrular
 * (bir kapı öne/arkaya kayarsa geliştirici yanlış hatayı görür).
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

/** Referanstan geçtiği ÖLÇÜLMÜŞ tek e-Fatura fikstürü — temiz taban. */
function baseXml(): string {
  return readFileSync(FIXTURE, 'utf8').replace(
    /<cbc:UUID>[^<]*<\/cbc:UUID>/,
    `<cbc:UUID>${randomUUID()}</cbc:UUID>`,
  );
}

function withNumber(xml: string, documentNumber: string): string {
  return xml.replace(/<cbc:ID>[^<]*<\/cbc:ID>/, `<cbc:ID>${documentNumber}</cbc:ID>`);
}

describe('ingest kapıları', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await startTestApp({ env: { ...liveEnv } });
    // Korpusun alıcısı sicilde olmalı (e-Fatura yolu).
    await ctx.repo.insertCompany({
      id: 'co_receiver_test',
      tenantId: 'tn_seed',
      vkn: '2222222222',
      title: 'DENEME ALICI LTD. ŞTİ.',
      addressCountry: 'Türkiye',
      addressStreet: null,
      addressDistrict: null,
      addressCity: null,
      taxOffice: null,
      pkAliases: [],
      gbAliases: [],
      profiles: [],
      templateId: null,
      seriesPrefix: null,
      eInvoiceRegistered: true,
    }).catch(() => undefined); // tohumda zaten varsa sorun değil
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

  const postUbl = (payload: string, extra?: Record<string, string>) =>
    ctx.app.inject({ method: 'POST', url: '/v1/documents/ubl', headers: headers(extra), payload });

  it('mimkit bağlı (bu blok canlı ölçüm ister)', () => {
    expect(liveEnv, `${LIVE_REQUIRED}`).toBeTruthy();
    expect(ctx.kittestReady).toBe(true);
  });

  it('KAPI: X-Company yoksa 400 BRANCH_REQUIRED', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/v1/documents/ubl',
      headers: { authorization: `Bearer ${SEED_TENANT_API_KEY}`, 'content-type': 'application/xml' },
      payload: baseXml(),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().errorCode).toBe('BRANCH_REQUIRED');
  });

  it.each([
    ['XML olmayan gövde', 'bu xml degil'],
    ['boş gövde', ''],
    ['kök yok', '<?xml version="1.0"?>'],
  ])('KAPI: %s → 400 MALFORMED_XML', async (_label, payload) => {
    const response = await postUbl(payload);
    expect(response.statusCode).toBe(400);
    expect(response.json().errorCode).toBe('MALFORMED_XML');
  });

  it('KAPI: ETTN UUID değilse 400 MALFORMED_XML', async () => {
    const xml = baseXml().replace(/<cbc:UUID>[^<]*<\/cbc:UUID>/, '<cbc:UUID>ettn-degil</cbc:UUID>');
    const response = await postUbl(xml);
    expect(response.statusCode).toBe(400);
    expect(response.json().errorCode).toBe('MALFORMED_XML');
  });

  it('KAPI: belge-no biçimi bozuksa 400 DOCNO_FORMAT', async () => {
    const response = await postUbl(withNumber(baseXml(), 'BOZUKNO1'));
    expect(response.statusCode).toBe(400);
    expect(response.json().errorCode).toBe('DOCNO_FORMAT');
  });

  it('KAPI: belge-no yılı belge tarihiyle uyuşmazsa 400 DOCNO_YEAR_MISMATCH', async () => {
    const response = await postUbl(withNumber(baseXml(), 'ORN2019000000001'));
    expect(response.statusCode).toBe(400);
    expect(response.json().errorCode).toBe('DOCNO_YEAR_MISMATCH');
  });

  it('KAPI: kökte iki TaxTotal varsa 400 MULTIPLE_TAX_TOTALS', async () => {
    // Kök TaxTotal'ı ikizle (kalem içi olanlara dokunmadan).
    const xml = baseXml().replace(
      /(<cac:TaxTotal>[\s\S]*?<\/cac:TaxTotal>)(\s*<cac:LegalMonetaryTotal>)/,
      '$1$1$2',
    );
    const response = await postUbl(xml);
    expect(response.statusCode).toBe(400);
    expect(response.json().errorCode).toBe('MULTIPLE_TAX_TOTALS');
  });

  it('KAPI: belgedeki gönderici X-Company değilse 400 SENDER_MISMATCH', async () => {
    const response = await postUbl(baseXml(), { 'x-company': '2222222222' });
    expect(response.statusCode).toBe(400);
    expect(response.json().errorCode).toBe('SENDER_MISMATCH');
  });

  it('KAPI: e-Fatura alıcısı sicilde yoksa 400 RECEIVER_NOT_REGISTERED', async () => {
    const xml = baseXml().replace(/2222222222/g, '7777777777');
    const response = await postUbl(xml);
    expect(response.statusCode).toBe(400);
    expect(response.json().errorCode).toBe('RECEIVER_NOT_REGISTERED');
  });

  it('kabul: temiz belge 202 + ettn (ölçüldü: 201 değil)', async () => {
    const response = await postUbl(withNumber(baseXml(), 'ORN2026000000101'));
    expect(response.statusCode).toBe(202);
    const body = response.json();
    expect(body.ettn).toMatch(/^[0-9a-f-]{36}$/i);
    // İmzasız + numaralı → AWAITING_SIGNATURE (sözlük §3.1 G2).
    expect(body.status).toBe('AWAITING_SIGNATURE');
  });

  it('KAPI: aynı ETTN ikinci kez 409 DUPLICATE_UUID', async () => {
    const xml = withNumber(baseXml(), 'ORN2026000000102');
    const first = await postUbl(xml);
    expect(first.statusCode).toBe(202);
    const second = await postUbl(xml);
    expect(second.statusCode).toBe(409);
    expect(second.json().errorCode).toBe('DUPLICATE_UUID');
  });

  it('KAPI: aynı belge-no farklı ETTN ile 409 DUPLICATE_DOCNO', async () => {
    const response = await postUbl(withNumber(baseXml(), 'ORN2026000000102'));
    expect(response.statusCode).toBe(409);
    expect(response.json().errorCode).toBe('DUPLICATE_DOCNO');
  });

  it('kabul edilen belge okunabilir ve XML\'i geri alınır', async () => {
    const created = await postUbl(withNumber(baseXml(), 'ORN2026000000103'));
    const id = created.json().id;

    const read = await ctx.app.inject({
      method: 'GET',
      url: `/v1/documents/${id}`,
      headers: { authorization: `Bearer ${SEED_TENANT_API_KEY}` },
    });
    expect(read.statusCode).toBe(200);
    const doc = read.json();
    expect(doc.type).toBe('EFATURA');
    expect(doc.documentNumber).toBe('ORN2026000000103');
    expect(doc.senderVkn).toBe('1111111111');
    // Doğrulama damgası kaydedildi (hangi XSD/şematron geçti).
    expect(doc.validation.appliedXsd).toBe('UBL-Invoice-2.1.xsd');
    expect(doc.validation.appliedSchematron).toBe('UBLTR_MAIN');

    const xml = await ctx.app.inject({
      method: 'GET',
      url: `/v1/documents/${id}/xml`,
      headers: { authorization: `Bearer ${SEED_TENANT_API_KEY}` },
    });
    expect(xml.statusCode).toBe(200);
    expect(xml.headers['content-type']).toContain('application/xml');
    expect(xml.body).toContain('<cbc:ID>ORN2026000000103</cbc:ID>');
  });

  it('liste sayfalanır ve süzülür', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/v1/documents?direction=OUTBOUND&limit=2',
      headers: { authorization: `Bearer ${SEED_TENANT_API_KEY}` },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.documents.length).toBeLessThanOrEqual(2);
    expect(body.page.total).toBeGreaterThanOrEqual(3);
  });

  it('KAPI: olmayan belge 404 DOCUMENT_NOT_FOUND', async () => {
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/v1/documents/doc_yok',
      headers: { authorization: `Bearer ${SEED_TENANT_API_KEY}` },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().errorCode).toBe('DOCUMENT_NOT_FOUND');
  });
});
