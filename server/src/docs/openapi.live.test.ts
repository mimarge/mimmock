/**
 * OpenAPI sözleşmesi — CANLI doğrulayıcı isteyen uçlar.
 *
 * Belge yaşam döngüsünün her adımında dönen GERÇEK gövde, belgedeki şemaya karşı
 * doğrulanır. Bir LLM entegrasyon kodunu bu şemalardan yazar; şema yanlışsa kodu da.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startTestApp, testMimkitEnv, LIVE_REQUIRED, type TestApp } from '../test-support.js';
import { SEED_TENANT_API_KEY } from '../seed.js';
import { assertMatchesSpec } from './contract.js';
import { EXAMPLE_INVOICE, buildOpenApiDocument } from './openapi.js';

const liveEnv = testMimkitEnv();
const FIXTURE = join(import.meta.dirname, '../__fixtures__/fidelity/accept/EFATURA-01-temel-satis.xml');

function invoice(id: string) {
  return {
    id,
    uuid: randomUUID(),
    datetime: `${new Date().getFullYear()}-01-15T10:00:00`,
    profile: 'TEMELFATURA',
    type: 'SATIS',
    currencyCode: 'TRY',
    sender: {
      taxNumber: '1111111111', name: 'DENEME GÖNDERİCİ A.Ş.', taxOffice: 'DENEME VERGİ DAİRESİ',
      address: 'Deneme Mah. No:1', district: 'Çankaya', city: 'Ankara',
    },
    customer: {
      taxNumber: '2222222222', name: 'DENEME ALICI LTD. ŞTİ.', taxOffice: 'DENEME VERGİ DAİRESİ',
      address: 'Deneme Cad. No:2', district: 'Kadıköy', city: 'İstanbul',
    },
    lines: [{ name: 'Sözleşme testi', quantity: 1, price: 1000, unitCode: 'Adet', kdvPercent: 20 }],
  };
}

describe('OpenAPI sözleşmesi — belge yaşam döngüsü (canlı)', () => {
  let ctx: TestApp;
  const auth = { authorization: `Bearer ${SEED_TENANT_API_KEY}` };
  const sender = { ...auth, 'x-company': '1111111111' };

  beforeAll(async () => {
    expect(liveEnv, `${LIVE_REQUIRED} — sözleşme ölçülmeden yeşil sayılmaz`).toBeTruthy();
    ctx = await startTestApp({ env: { ...liveEnv } });
    expect(ctx.kittestReady).toBe(true);
  });
  afterAll(async () => {
    await ctx?.close();
  });

  async function call(
    method: 'GET' | 'POST',
    url: string,
    options: { payload?: unknown; headers?: Record<string, string>; raw?: string } = {},
  ) {
    const res = await ctx.app.inject({
      method,
      url,
      headers: options.headers ?? auth,
      ...(options.raw !== undefined ? { payload: options.raw } : options.payload !== undefined ? { payload: options.payload as object } : {}),
    });
    const isJson = res.headers['content-type']?.toString().includes('json');
    if (isJson) assertMatchesSpec(method, url, res.statusCode, res.json());
    return { status: res.statusCode, body: isJson ? res.json() : res.body, headers: res.headers };
  }

  it('JSON gönderim → 202 DocumentAccepted, sonra her okuma ucu şemaya uyar', async () => {
    const year = new Date().getFullYear();
    const accepted = await call('POST', '/v1/documents', {
      payload: invoice(`SZL${year}000000001`),
      headers: { ...sender, 'x-scenario': 'gib_error' },
    });
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(202);
    const id = (accepted.body as { id: string }).id;

    await call('GET', `/v1/documents/${id}`);
    await call('GET', '/v1/documents?direction=OUTBOUND');

    // Motoru sonuna kadar yürüt: gib_error → SEND_FAILED
    await call('POST', '/v1/_sandbox/clock', { payload: { advanceMs: 60_000 } });
    const failed = await call('GET', `/v1/documents/${id}`);
    expect((failed.body as { status: string }).status).toBe('SEND_FAILED');

    const history = await call('GET', `/v1/documents/${id}/history`);
    expect((history.body as { events: unknown[] }).events.length).toBeGreaterThan(2);

    // resend: 1150 B SINIFI → 409 NEEDS_RESIGN (ölçüldü; "tekrar dene" onu çözmez)
    const refused = await call('POST', `/v1/documents/${id}/resend`);
    expect(refused.status).toBe(409);
    expect((refused.body as { errorCode: string }).errorCode).toBe('NEEDS_RESIGN');

    await call('POST', `/v1/_sandbox/documents/${id}/scenario`, { payload: { scenario: 'happy' } });
    await call('POST', `/v1/_sandbox/documents/${id}/advance`);
    await call('POST', `/v1/_sandbox/documents/${id}/fail`, { payload: { rawGibCode: 1150 } });

    const xml = await call('GET', `/v1/documents/${id}/xml`);
    expect(xml.headers['content-type']).toMatch(/application\/xml/);
    expect(xml.headers['x-mimmock-document-signature']).toMatch(/chain-validation-fails-by-design/);
  });

  it('A sınıfı hata (1230) yeniden gönderilir → 200 ve şemaya uyar', async () => {
    const year = new Date().getFullYear();
    const accepted = await call('POST', '/v1/documents', {
      payload: invoice(`SZL${year}000000003`),
      headers: { ...sender, 'x-scenario': 'receiver_reject' },
    });
    const id = (accepted.body as { id: string }).id;
    await call('POST', '/v1/_sandbox/clock', { payload: { advanceMs: 60_000 } });
    const doc = await call('GET', `/v1/documents/${id}`);
    expect((doc.body as { status: string; rawGibCode: number }).rawGibCode).toBe(1230);
    const resent = await call('POST', `/v1/documents/${id}/resend`);
    expect(resent.status, JSON.stringify(resent.body)).toBe(200);
    expect((resent.body as { status: string }).status).toBe('PROCESSING');
  });

  it('arıza enjeksiyonu: geçiş UYGULANDIĞINDA da, uygulanmadığında da şemaya uyar', async () => {
    const year = new Date().getFullYear();
    const accepted = await call('POST', '/v1/documents', {
      payload: invoice(`SZL${year}000000004`),
      headers: { ...sender, 'x-scenario': 'happy' },
    });
    const id = (accepted.body as { id: string }).id;
    await call('POST', '/v1/_sandbox/clock', { payload: { advanceMs: 60_000 } });
    // Uygulanan dal: DELIVERED + 1230 → SEND_FAILED (teslim geri alınır)
    const applied = await call('POST', `/v1/_sandbox/documents/${id}/fail`, { payload: { rawGibCode: 1230 } });
    expect((applied.body as { status: string }).status).toBe('SEND_FAILED');
    // Uygulanmayan dal: ara kod, durum değişmez, `note` açıklar
    const noop = await call('POST', `/v1/_sandbox/documents/${id}/fail`, { payload: { rawGibCode: 1100 } });
    expect((noop.body as { note?: string }).note).toBeTruthy();
  });

  it('🔑 belgedeki ÖRNEK gövde gerçekten kabul edilir, zorunlu her alan gerçekten zorunlu', async () => {
    const year = new Date().getFullYear();
    // Örneğin kendisi (yalnız yıl ve tekil alanlar tazelenir — aynı ETTN ikinci kez 409 alır).
    const fresh = {
      ...EXAMPLE_INVOICE,
      id: `ORN${year}000000901`,
      uuid: randomUUID(),
      datetime: `${year}-01-20T10:00:00`,
    };
    const ok = await call('POST', '/v1/documents', { payload: fresh, headers: sender });
    expect(ok.status, JSON.stringify(ok.body)).toBe(202);

    // Belgenin `required` dediği her alan eksikken reddedilmeli — belge "zorunlu"
    // deyip sunucu kabul ederse ya da tersi, bir ajan yanlış kod yazar.
    const schema = (buildOpenApiDocument() as {
      components: { schemas: { JsonInvoiceInput: { required: string[] } } };
    }).components.schemas.JsonInvoiceInput;
    let n = 910;
    for (const field of schema.required) {
      const body: Record<string, unknown> = { ...fresh, id: `ORN${year}000000${n++}`, uuid: randomUUID() };
      delete body[field];
      const res = await call('POST', '/v1/documents', { payload: body, headers: sender });
      expect(res.status, `${field} eksikken ${res.status}: ${JSON.stringify(res.body)}`).toBe(400);
    }
  });

  it('hata yanıtları da şemaya uyar: çift ETTN, bozuk JSON, X-Company yok', async () => {
    const year = new Date().getFullYear();
    const body = invoice(`SZL${year}000000002`);
    expect((await call('POST', '/v1/documents', { payload: body, headers: sender })).status).toBe(202);
    expect((await call('POST', '/v1/documents', { payload: body, headers: sender })).status).toBe(409);
    expect((await call('POST', '/v1/documents', { payload: { sender: {} }, headers: sender })).status).toBe(400);
    expect((await call('POST', '/v1/documents', { payload: body })).status).toBe(400);
  });

  it('gelen kutusu: enjeksiyon → RECEIVED → yanıt kapısı → teyit sonrası', async () => {
    const xml = readFileSync(FIXTURE, 'utf8');
    const injected = await call('POST', '/v1/_sandbox/inbox', {
      raw: xml,
      headers: { ...auth, 'x-company': '2222222222', 'content-type': 'application/xml' },
    });
    expect(injected.status, JSON.stringify(injected.body)).toBe(202);
    const id = (injected.body as { id: string }).id;

    await call('GET', `/v1/inbox/${id}`);
    await call('GET', '/v1/inbox');
    // İki adımlı akış: teyitten önce yanıt yok (belge ticari değilse NOT_COMMERCIAL) — her iki 409 de şemaya uymalı
    const early = await call('POST', `/v1/inbox/${id}/reply`, { payload: { decision: 'ACCEPTED' } });
    expect(early.status).toBe(409);
    expect((await call('POST', `/v1/inbox/${id}/reply`, { payload: { decision: 'REJECTED' } })).status).toBe(400);
  });

  it('trafik üreteci ve teslim günlüğü şemaya uyar', async () => {
    const produced = await call('POST', '/v1/_sandbox/traffic');
    expect(produced.status).toBe(200);
    await call('POST', '/v1/_sandbox/clock', { payload: { advanceMs: 120_000 } });
    await ctx.dispatcher.drain();
    const hooks = await call('GET', '/v1/webhooks');
    const hookId = (hooks.body as { webhooks: Array<{ id: string }> }).webhooks[0]!.id;
    const deliveries = await call('GET', `/v1/webhooks/${hookId}/deliveries`);
    expect((deliveries.body as { deliveries: unknown[] }).deliveries.length).toBeGreaterThan(0);
    await call('GET', '/v1/_sandbox/webhook-sink');
    await call('GET', '/v1/_sandbox/requests?errorsOnly=1');
  });
});
