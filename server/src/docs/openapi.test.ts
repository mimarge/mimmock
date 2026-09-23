/**
 * OpenAPI belgesi ↔ çalışan sunucu — AĞ İSTEMEZ.
 *
 * Elle yazılmış bir API belgesinin tek tehlikesi sunucudan ayrışmasıdır; bir LLM
 * yanlış belgeyle yanlış kod yazar. Üç ölçü:
 *   1. rota eşliği — iki yönlü
 *   2. belgenin kendisi geçerli OpenAPI 3.1 mi
 *   3. gerçek yanıtlar belgedeki şemaya uyuyor mu (iki yönlü: fazla alan da, eksik alan da kırmızı)
 * Belge alma gibi canlı doğrulayıcı isteyen uçların sözleşmesi `openapi.live.test.ts`'te.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { validate } from '@scalar/openapi-parser';
import { startTestApp, type TestApp } from '../test-support.js';
import { SEED_TENANT_API_KEY } from '../seed.js';
import { ERROR_CATALOG } from '../errors.js';
import { buildOpenApiDocument } from './openapi.js';
import { assertMatchesSpec } from './contract.js';

const doc = buildOpenApiDocument() as { paths: Record<string, Record<string, unknown>> };

/** Belgenin kapsamı: API yüzeyi. Scalar'ın iç rotaları ve panel varlıkları dışarıda. */
const inScope = (url: string) => url === '/healthz' || url === '/v1' || url.startsWith('/v1/');
const toTemplate = (url: string) => url.replace(/:([A-Za-z]+)/g, '{$1}');

describe('OpenAPI — rota eşliği', () => {
  let ctx: TestApp;
  beforeAll(async () => {
    ctx = await startTestApp();
  });
  afterAll(async () => {
    await ctx?.close();
  });

  const documented = () =>
    new Set(
      Object.entries(doc.paths).flatMap(([path, ops]) =>
        Object.keys(ops).map((method) => `${method.toUpperCase()} ${path}`),
      ),
    );
  const served = () =>
    new Set(
      ctx.routes
        .filter((r) => r.method !== 'HEAD' && inScope(r.url))
        .map((r) => `${r.method} ${toTemplate(r.url)}`),
    );

  it('ölçü sağır değil: sunucuda gerçekten rota var', () => {
    // Rota toplayıcı bozulursa iki küme de boş kalır ve "eşit" görünür.
    expect(served().size).toBeGreaterThan(25);
  });

  it('🔑 sunucudaki HER uç belgede', () => {
    const missing = [...served()].filter((r) => !documented().has(r));
    expect(missing, 'belgelenmemiş uçlar').toEqual([]);
  });

  it('🔑 belgedeki HER uç sunucuda', () => {
    const phantom = [...documented()].filter((r) => !served().has(r));
    expect(phantom, 'sunucuda olmayan belge satırları').toEqual([]);
  });
});

describe('OpenAPI — belgenin kendisi', () => {
  it('geçerli OpenAPI 3.1', async () => {
    const result = await validate(buildOpenApiDocument());
    expect(result.errors ?? [], JSON.stringify(result.errors, null, 2)).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('hata kodu listesi katalogdan türetilmiş', () => {
    const d = buildOpenApiDocument() as { components: { schemas: { ErrorCode: { enum: string[] } } } };
    expect(d.components.schemas.ErrorCode.enum).toEqual(Object.keys(ERROR_CATALOG));
  });

  it('her uçta en az bir yanıt ve özet var', () => {
    for (const [path, ops] of Object.entries(doc.paths)) {
      for (const [method, op] of Object.entries(ops as Record<string, { summary?: string; responses?: object }>)) {
        expect(op.summary, `${method} ${path} özetsiz`).toBeTruthy();
        expect(Object.keys(op.responses ?? {}).length, `${method} ${path} yanıtsız`).toBeGreaterThan(0);
      }
    }
  });
});

describe('OpenAPI — gerçek yanıtlar şemaya uyuyor (ağsız uçlar)', () => {
  let ctx: TestApp;
  const auth = { authorization: `Bearer ${SEED_TENANT_API_KEY}` };

  beforeAll(async () => {
    ctx = await startTestApp();
  });
  afterAll(async () => {
    await ctx?.close();
  });

  async function call(method: 'GET' | 'POST', url: string, payload?: unknown, headers = auth) {
    const res = await ctx.app.inject({ method, url, headers, ...(payload !== undefined ? { payload: payload as object } : {}) });
    const body = res.headers['content-type']?.toString().includes('json') ? res.json() : res.body;
    assertMatchesSpec(method, url, res.statusCode, body);
    return { status: res.statusCode, body };
  }

  it('denetçi sağır değil: şemaya uymayan gövdeyi REDDEDER', () => {
    // Fazla alan
    expect(() => assertMatchesSpec('GET', '/v1/_sandbox/clock', 200, {
      now: new Date().toISOString(), offsetMs: 0, real: new Date().toISOString(), extra: 1,
    })).toThrow(/Sözleşme ihlali/);
    // Eksik alan
    expect(() => assertMatchesSpec('GET', '/v1/_sandbox/clock', 200, { now: new Date().toISOString() }))
      .toThrow(/Sözleşme ihlali/);
    // Belgede olmayan durum kodu
    expect(() => assertMatchesSpec('GET', '/v1/_sandbox/clock', 418, {})).toThrow(/tarif edilmemiş/);
    // Belgede olmayan uç
    expect(() => assertMatchesSpec('GET', '/v1/yok-boyle-bir-uc', 200, {})).toThrow(/belgesinde yok/);
  });

  it('/healthz', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/healthz' });
    assertMatchesSpec('GET', '/healthz', res.statusCode, res.json());
  });

  it('/v1 kök dizini', async () => {
    const { body } = await call('GET', '/v1');
    expect((body as { docs: { llmsFull: string } }).docs.llmsFull).toMatch(/\/llms-full\.txt$/);
  });

  it('şirketler: liste, oluştur, tek, çakışma, bulunamadı', async () => {
    await call('GET', '/v1/companies');
    const created = await call('POST', '/v1/companies', {
      vkn: '3333333333', title: 'SÖZLEŞME TEST A.Ş.', eInvoiceRegistered: true, profiles: ['TEMELFATURA'],
    });
    expect(created.status).toBe(201);
    await call('GET', '/v1/companies/3333333333');
    expect((await call('POST', '/v1/companies', { vkn: '3333333333', title: 'X', eInvoiceRegistered: true })).status).toBe(409);
    expect((await call('GET', '/v1/companies/4444444444')).status).toBe(404);
    expect((await call('POST', '/v1/companies', { vkn: '12', title: '' })).status).toBe(400);
  });

  it('kimlik hataları', async () => {
    expect((await call('GET', '/v1/companies', undefined, {} as typeof auth)).status).toBe(401);
    expect((await call('GET', '/v1/companies', undefined, { authorization: 'Bearer yanlis' })).status).toBe(401);
  });

  it('webhook: liste, oluştur, teslimler, geçersiz girdi', async () => {
    const list = await call('GET', '/v1/webhooks');
    const created = await call('POST', '/v1/webhooks', { url: 'http://127.0.0.1:9/hook', events: ['document.delivered'] });
    expect(created.status).toBe(201);
    const id = (created.body as { id: string }).id;
    await call('GET', `/v1/webhooks/${id}/deliveries`);
    expect((await call('POST', '/v1/webhooks', { url: 'ftp://x' })).status).toBe(400);
    expect((await call('POST', `/v1/webhooks/${id}/replay`, { deliveryId: 'yok' })).status).toBe(404);
    expect((list.body as { webhooks: unknown[] }).webhooks.length).toBeGreaterThan(0);
  });

  it('sandbox: senaryolar, saat, istek günlüğü, alıcı, trafik tohumu', async () => {
    await call('GET', '/v1/_sandbox/scenarios');
    await call('GET', '/v1/_sandbox/clock');
    await call('POST', '/v1/_sandbox/clock', { advanceMs: 1000 });
    expect((await call('POST', '/v1/_sandbox/clock', {})).status).toBe(400);
    await call('GET', '/v1/_sandbox/requests');
    await call('GET', '/v1/_sandbox/webhook-sink');
    await call('POST', '/v1/_sandbox/traffic/reset');
  });

  it('belge ve gelen kutusu listeleri (boş olsa da şema tutmalı), bulunamadı', async () => {
    await call('GET', '/v1/documents');
    await call('GET', '/v1/inbox');
    expect((await call('GET', '/v1/documents/doc_yok')).status).toBe(404);
    expect((await call('GET', '/v1/inbox/doc_yok')).status).toBe(404);
    expect((await call('POST', '/v1/_sandbox/documents/doc_yok/advance')).status).toBe(404);
  });

  it('🔴 boş gövde + JSON içerik tipi = boş nesne (gövdesiz POST uçları)', async () => {
    /*
     * Canlı ölçümde yakalandı: pek çok HTTP istemcisi (panelin kendisi dahil) her
     * isteğe `content-type: application/json` koyar. Fastify'ın varsayılanı boş
     * gövdeyi 400 ile reddediyordu — gövde istemeyen `/traffic`, `/advance`,
     * `/reset` uçları istemciye göre bozuk görünürdü.
     */
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/_sandbox/traffic/reset',
      headers: { ...auth, 'content-type': 'application/json' },
      payload: '',
    });
    expect(res.statusCode, res.body).toBe(200);
    assertMatchesSpec('POST', '/v1/_sandbox/traffic/reset', res.statusCode, res.json());
    // Bozuk JSON ise hâlâ reddedilmeli — boşluk toleransı ayrıştırıcıyı gevşetmez.
    const bad = await ctx.app.inject({
      method: 'POST',
      url: '/v1/companies',
      headers: { ...auth, 'content-type': 'application/json' },
      payload: '{bozuk',
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().errorCode).toBe('VALIDATION_FAILED');
  });

  it('sıfırlama', async () => {
    const { body } = await call('POST', '/v1/_sandbox/reset');
    expect((body as { reset: boolean }).reset).toBe(true);
  });
});

describe('belge yüzeyi', () => {
  let ctx: TestApp;
  beforeAll(async () => {
    ctx = await startTestApp();
  });
  afterAll(async () => {
    await ctx?.close();
  });

  it('/openapi.json isteğin adresini sunucu olarak yazar', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/openapi.json', headers: { host: 'ornek.local:9999' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().servers[0].url).toBe('http://ornek.local:9999');
  });

  it('/docs açılır ve DIŞARI KONUŞMAZ (font sunucusu, CDN yok)', async () => {
    // `/docs` → `/docs/` (Scalar'ın kendi yönlendirmesi); iki adres de çalışmalı.
    const redirect = await ctx.app.inject({ method: 'GET', url: '/docs' });
    expect([200, 301, 302]).toContain(redirect.statusCode);
    const html = await ctx.app.inject({ method: 'GET', url: '/docs/' });
    expect(html.statusCode).toBe(200);
    expect(html.body).toContain('/openapi.json');
    expect(html.body).not.toMatch(/fonts\.scalar\.com|cdn\.jsdelivr\.net|unpkg\.com/);
    /*
     * Font/telemetri kararı HTML'de değil, sayfaya gömülen yapılandırmada verilir
     * ve istemcide uygulanır — HTML'e bakmak SAĞIRDI (mutasyon D5 bunu gösterdi).
     * Gömülü yapılandırma ayrıştırılıp üç ayar tek tek iddia edilir.
     */
    const configJson = /createApiReference\([^,]+,\s*(\{[\s\S]*?\})\s*\)\s*;?\s*<\/script>/.exec(html.body)?.[1];
    expect(configJson, 'Scalar yapılandırması bulunamadı').toBeTruthy();
    const config = JSON.parse(configJson!) as Record<string, unknown>;
    expect(config.withDefaultFonts).toBe(false);
    expect(config.telemetry).toBe(false);
    expect((config.mcp as { disabled?: boolean } | undefined)?.disabled).toBe(true);
    expect(config.proxyUrl).toBeUndefined();
    // Betik yerelden sunulmalı
    const src = /<script[^>]+src="([^"]+)"/.exec(html.body)?.[1];
    expect(src, 'Scalar betiği bulunamadı').toBeTruthy();
    expect(src!).not.toMatch(/^https?:/);
    const js = await ctx.app.inject({ method: 'GET', url: src!.startsWith('/') ? src! : `/docs/${src}` });
    expect(js.statusCode).toBe(200);
    expect(Number(js.headers['content-length'] ?? js.body.length)).toBeGreaterThan(100_000);
  });

  it('/llms.txt ve /llms-full.txt markdown döner ve birbirini gösterir', async () => {
    const index = await ctx.app.inject({ method: 'GET', url: '/llms.txt', headers: { host: 'h:1' } });
    expect(index.headers['content-type']).toMatch(/text\/markdown/);
    expect(index.body).toMatch(/^# MimMock\n\n> /);
    expect(index.body).toContain('http://h:1/llms-full.txt');
    const full = await ctx.app.inject({ method: 'GET', url: '/llms-full.txt' });
    expect(full.statusCode).toBe(200);
    expect(full.body).not.toContain('{{');
  });

  it('API yanıtları belgelerini Link başlığıyla gösterir', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/_sandbox/clock', headers: { authorization: `Bearer ${SEED_TENANT_API_KEY}` } });
    expect(res.headers.link).toMatch(/<\/openapi\.json>; rel="service-desc"/);
    expect(res.headers.link).toMatch(/<\/llms-full\.txt>; rel="describedby"/);
  });
});
