/**
 * GÖRÜNTÜ — M7 ölçüsü (plan §9).
 *
 * Plan: *"Ölç: GERÇEKTEN ÇİZİLMİŞ çıktı, şablon kaynağının okunuşu değil."*
 *
 * Bu yüzden test "servis 200 döndü" ile yetinmez: çizilen HTML'in İÇİNDE belgenin
 * gerçek alanlarını (belge no, taraf unvanı, tutar) arar ve PDF'in gerçek bir PDF
 * olduğunu bayt düzeyinde doğrular. Sahte bir çıktı bu testlerden geçemez.
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

describe('görüntü — canlı mimkit şablonu', () => {
  let ctx: TestApp;
  let documentId: string;

  beforeAll(async () => {
    expect(liveEnv, `${LIVE_REQUIRED}`).toBeTruthy();
    expect(mimkitUrl, 'MIMMOCK_TEST_MIMKIT_URL gerekli — görüntü CANLI gelir (plan K4)').toBeTruthy();
    ctx = await startTestApp({
      env: {
        MIMMOCK_MIMKIT_URL: mimkitUrl,
        MIMMOCK_MIMKIT_TOKEN: mimkitToken,
        MIMMOCK_MIMKIT_SCOPE_ID: `mimmock-render-${process.env.MIMMOCK_TEST_SCOPE ?? 'local'}`,
      },
    });

    const xml = readFileSync(FIXTURE, 'utf8')
      .replace(/<cbc:UUID>[^<]*<\/cbc:UUID>/, `<cbc:UUID>${randomUUID()}</cbc:UUID>`)
      .replace(/<cbc:ID>ORN\d+<\/cbc:ID>/, '<cbc:ID>ORN2026000000401</cbc:ID>');
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/v1/documents/ubl',
      headers: {
        authorization: `Bearer ${SEED_TENANT_API_KEY}`,
        'x-company': '1111111111',
        'content-type': 'application/xml',
      },
      payload: xml,
    });
    expect(created.statusCode, JSON.stringify(created.json())).toBe(202);
    documentId = created.json().id as string;
  });
  afterAll(async () => {
    await ctx?.close();
  });

  const auth = { authorization: `Bearer ${SEED_TENANT_API_KEY}` };

  it('🔑 HTML GERÇEKTEN çizilir — belge alanları çıktının İÇİNDE', async () => {
    const response = await ctx.app.inject({
      method: 'GET', url: `/v1/documents/${documentId}/html`, headers: auth,
    });
    expect(response.statusCode, response.body.slice(0, 300)).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');

    const html = response.body;
    // Çizilmiş bir HTML belgesi olmalı — XML'in kendisi değil.
    expect(html).toMatch(/<html/i);
    expect(html).not.toContain('<cbc:UBLVersionID>');

    /*
     * 🔑 Asıl ölçüm: belgenin GERÇEK alanları çıktıda görünüyor mu. Şablonun
     * çalıştığını kanıtlayan şey budur; "200 döndü" değil.
     */
    expect(html, 'belge numarası çizilmemiş').toContain('ORN2026000000401');
    expect(html, 'gönderici unvanı çizilmemiş').toMatch(/ÖRNEK YAZILIM|ORNEK YAZILIM/);
    expect(html, 'alıcı unvanı çizilmemiş').toMatch(/DENEME T[İI]CARET/);
    /*
     * 🔑 En güçlü kanıt: ham UBL'de tutar `2640.00` yazar, çıktıda `2.640,00`
     * görünür. Yani şablon yalnız metni GEÇİRMİYOR, Türkçe para biçimlendirmesi
     * UYGULUYOR — şablon dönüşümü gerçekten koşmuş demektir. XML'i olduğu gibi yankılayan
     * sahte bir "görüntü" bu satırdan geçemez.
     */
    expect(html, 'tutar Türkçe biçimde çizilmemiş').toContain('2.640,00');
    expect(html, 'ham XML biçimi sızmış').not.toContain('>2640.00<');
  });

  it('hangi şablonun çizdiği başlıkta görünür', async () => {
    const response = await ctx.app.inject({
      method: 'GET', url: `/v1/documents/${documentId}/html`, headers: auth,
    });
    // Şirket şablon seçmediyse sistem varsayılanı kullanılır ve bu SÖYLENİR.
    expect(response.headers['x-mimmock-template']).toBeTruthy();
  });

  it('🔑 PDF GERÇEKTEN çizilir — bayt imzası ve boyut', async () => {
    const response = await ctx.app.inject({
      method: 'GET', url: `/v1/documents/${documentId}/pdf`, headers: auth,
    });
    expect(response.statusCode, response.body.slice(0, 300)).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-disposition']).toContain('ORN2026000000401.pdf');

    const bytes = response.rawPayload;
    // Gerçek bir PDF `%PDF-` ile başlar ve `%%EOF` ile biter.
    expect(bytes.subarray(0, 5).toString('latin1'), 'PDF imzası yok').toBe('%PDF-');
    expect(bytes.subarray(-1024).toString('latin1')).toContain('%%EOF');
    // Boş/iskelet bir PDF değil.
    expect(bytes.length, 'PDF fazla küçük — gerçekten çizilmemiş olabilir').toBeGreaterThan(3000);
  });

  it('gelen belge de çizilebilir (iki yön de görüntülenir)', async () => {
    const xml = readFileSync(FIXTURE, 'utf8')
      .replace(/<cbc:UUID>[^<]*<\/cbc:UUID>/, `<cbc:UUID>${randomUUID()}</cbc:UUID>`)
      .replace(/<cbc:ID>ORN\d+<\/cbc:ID>/, '<cbc:ID>ORN2026000000402</cbc:ID>');
    const injected = await ctx.app.inject({
      method: 'POST',
      url: '/v1/_sandbox/inbox',
      headers: { ...auth, 'x-company': '2222222222', 'content-type': 'application/xml' },
      payload: xml,
    });
    expect(injected.statusCode).toBe(202);

    const html = await ctx.app.inject({
      method: 'GET', url: `/v1/documents/${injected.json().id}/html`, headers: auth,
    });
    expect(html.statusCode).toBe(200);
    expect(html.body).toContain('ORN2026000000402');
  });

  it('şablon listesi okunabilir (şirket seçimi için)', async () => {
    const response = await ctx.app.inject({
      method: 'GET', url: '/v1/templates', headers: { ...auth, 'x-company': '1111111111' },
    });
    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.json().templates)).toBe(true);
  });

  it('KAPI: olmayan belge 404', async () => {
    const response = await ctx.app.inject({
      method: 'GET', url: '/v1/documents/doc_yok/pdf', headers: auth,
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().errorCode).toBe('DOCUMENT_NOT_FOUND');
  });

  it('KAPI: olmayan şablon seçilmişse 404 TEMPLATE_NOT_FOUND', async () => {
    await ctx.handle.execRaw(
      `UPDATE companies SET template_id = 'tpl_yokboyle@1' WHERE vkn = '1111111111'`,
    );
    try {
      const response = await ctx.app.inject({
        method: 'GET', url: `/v1/documents/${documentId}/html`, headers: auth,
      });
      expect(response.statusCode).toBe(404);
      expect(response.json().errorCode).toBe('TEMPLATE_NOT_FOUND');
    } finally {
      await ctx.handle.execRaw(`UPDATE companies SET template_id = NULL WHERE vkn = '1111111111'`);
    }
  });
});
