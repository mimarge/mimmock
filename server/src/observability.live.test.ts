/**
 * İSTEK GÜNLÜĞÜ ve OLAY GEÇMİŞİ — plan §8.
 *
 * Panelin üç sorusunun veri kaynağı burasıdır:
 *   *ne oldu?* → istek günlüğü · *neden oldu?* → olay geçmişi ·
 *   *şimdi ne olacak?* → belgenin `nextState`/`nextAt` alanları.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startTestApp, testMimkitEnv, LIVE_REQUIRED, type TestApp } from './test-support.js';
import { SEED_TENANT_API_KEY } from './seed.js';

const FIXTURE = join(
  import.meta.dirname,
  '__fixtures__/fidelity/accept/EFATURA-01-temel-satis.xml',
);
const liveEnv = testMimkitEnv();

describe('istek günlüğü', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    expect(liveEnv, `${LIVE_REQUIRED}`).toBeTruthy();
    ctx = await startTestApp({ env: { ...liveEnv } });
  });
  afterAll(async () => {
    await ctx?.close();
  });

  const auth = { authorization: `Bearer ${SEED_TENANT_API_KEY}` };

  it('🔑 istek ve yanıt HAM olarak kaydedilir', async () => {
    await ctx.app.inject({ method: 'GET', url: '/v1/companies', headers: auth });

    const log = await ctx.app.inject({
      method: 'GET', url: '/v1/_sandbox/requests', headers: auth,
    });
    expect(log.statusCode).toBe(200);
    const entry = log.json().requests.find((r: { url: string }) => r.url === '/v1/companies');
    expect(entry, 'istek günlüğe girmedi').toBeTruthy();
    expect(entry.method).toBe('GET');
    expect(entry.status).toBe(200);
    expect(entry.durationMs).toBeGreaterThanOrEqual(0);
    // Yanıt gövdesi HAM duruyor — yorumlanmış özet değil.
    expect(entry.responseBody).toContain('1111111111');
  });

  it('🔴 gizli başlıklar MASKELENİR (ekran görüntüsü sızıntısı)', async () => {
    await ctx.app.inject({ method: 'GET', url: '/v1/companies', headers: auth });
    const log = await ctx.app.inject({
      method: 'GET', url: '/v1/_sandbox/requests', headers: auth,
    });
    const entry = log.json().requests[0];
    const authHeader = entry.requestHeaders.authorization as string;
    expect(authHeader, 'API anahtarı ham yazılmış').not.toContain(SEED_TENANT_API_KEY);
    expect(authHeader).toContain('maskelendi');
  });

  it('HATALI istekler de kaydedilir — "anahtarım neden çalışmıyor"', async () => {
    await ctx.app.inject({
      method: 'GET', url: '/v1/companies', headers: { authorization: 'Bearer yanlis' },
    });
    const log = await ctx.app.inject({
      method: 'GET', url: '/v1/_sandbox/requests', headers: auth,
    });
    // Kimliği çözülemeyen istek kiracıya bağlanamaz; ama hata kodlu istekler
    // (geçerli anahtarla) errorCode ile süzülebilir.
    const created = await ctx.app.inject({
      method: 'POST', url: '/v1/companies', headers: auth, payload: { vkn: '123' },
    });
    expect(created.statusCode).toBe(400);

    const after = await ctx.app.inject({
      method: 'GET', url: '/v1/_sandbox/requests', headers: auth,
    });
    const failed = after.json().requests.find((r: { errorCode: string | null }) => r.errorCode);
    expect(failed, 'hatalı istek günlüğe girmedi').toBeTruthy();
    expect(failed.errorCode).toBe('INVALID_VKN');
  });

  it('günlüğün kendisi günlüğe girmez (gürültü sinyali boğmasın)', async () => {
    await ctx.app.inject({ method: 'GET', url: '/v1/_sandbox/requests', headers: auth });
    const log = await ctx.app.inject({
      method: 'GET', url: '/v1/_sandbox/requests', headers: auth,
    });
    const self = log.json().requests.filter((r: { url: string }) =>
      r.url.startsWith('/v1/_sandbox/requests'),
    );
    expect(self.length).toBe(0);
  });
});

describe('belge olay geçmişi', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await startTestApp({ env: { ...liveEnv } });
  });
  afterAll(async () => {
    await ctx?.close();
  });

  const auth = { authorization: `Bearer ${SEED_TENANT_API_KEY}` };

  it('🔑 her geçiş KURAL KİMLİĞİYLE kaydedilir — "neden oldu"', async () => {
    const xml = readFileSync(FIXTURE, 'utf8')
      .replace(/<cbc:UUID>[^<]*<\/cbc:UUID>/, `<cbc:UUID>${randomUUID()}</cbc:UUID>`)
      .replace(/<cbc:ID>ORN\d+<\/cbc:ID>/, '<cbc:ID>ORN2026000000201</cbc:ID>');
    const created = await ctx.app.inject({
      method: 'POST', url: '/v1/documents/ubl',
      headers: { ...auth, 'x-company': '1111111111', 'content-type': 'application/xml' },
      payload: xml,
    });
    const id = created.json().id as string;

    ctx.clock.advance(30_000);
    await ctx.engine.tick();

    const history = await ctx.app.inject({
      method: 'GET', url: `/v1/documents/${id}/history`, headers: auth,
    });
    expect(history.statusCode).toBe(200);
    const events = history.json().events as Array<Record<string, unknown>>;

    // happy senaryosu: G6 (imza) → G7 (gönderim) → G9 (teslim).
    const ruleIds = events.map((e) => e.ruleId);
    expect(ruleIds, 'sözlük kural kimlikleri kaydedilmemiş').toEqual(
      expect.arrayContaining(['G6', 'G7', 'G9']),
    );

    const delivered = events.find((e) => e.to === 'DELIVERED');
    expect(delivered!.ruleId).toBe('G9');
    // 🔑 Ham GİB kodu da geçmişte: "neden DELIVERED oldu" → çünkü 1220 geldi.
    expect(delivered!.rawGibCode).toBe(1220);
    expect(delivered!.axis).toBe('status');
  });

  it('alarm üreten geçişler geçmişte GÖRÜNÜR', async () => {
    const xml = readFileSync(FIXTURE, 'utf8')
      .replace(/<cbc:UUID>[^<]*<\/cbc:UUID>/, `<cbc:UUID>${randomUUID()}</cbc:UUID>`)
      .replace(/<cbc:ID>ORN\d+<\/cbc:ID>/, '<cbc:ID>ORN2026000000202</cbc:ID>');
    const created = await ctx.app.inject({
      method: 'POST', url: '/v1/documents/ubl',
      headers: {
        ...auth, 'x-company': '1111111111',
        'content-type': 'application/xml', 'x-scenario': 'receiver_reject',
      },
      payload: xml,
    });
    ctx.clock.advance(60_000);
    await ctx.engine.tick();

    const history = await ctx.app.inject({
      method: 'GET', url: `/v1/documents/${created.json().id}/history`, headers: auth,
    });
    const events = history.json().events as Array<Record<string, unknown>>;
    const revoked = events.find((e) => e.alarm === 'DOCUMENT_DELIVERY_REVOKED');
    expect(revoked, 'teslim geri alma alarmı geçmişte yok').toBeTruthy();
    expect(revoked!.ruleId).toBe('G12');
    expect(revoked!.rawGibCode).toBe(1230);
  });

  it('sürüm numarası her olayda artar (webhook sıralaması ile hizalı)', async () => {
    const xml = readFileSync(FIXTURE, 'utf8')
      .replace(/<cbc:UUID>[^<]*<\/cbc:UUID>/, `<cbc:UUID>${randomUUID()}</cbc:UUID>`)
      .replace(/<cbc:ID>ORN\d+<\/cbc:ID>/, '<cbc:ID>ORN2026000000203</cbc:ID>');
    const created = await ctx.app.inject({
      method: 'POST', url: '/v1/documents/ubl',
      headers: { ...auth, 'x-company': '1111111111', 'content-type': 'application/xml' },
      payload: xml,
    });
    ctx.clock.advance(30_000);
    await ctx.engine.tick();

    const history = await ctx.app.inject({
      method: 'GET', url: `/v1/documents/${created.json().id}/history`, headers: auth,
    });
    const versions = (history.json().events as Array<{ documentVersion: number }>).map(
      (e) => e.documentVersion,
    );
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    expect(new Set(versions).size, 'sürümler tekrar ediyor').toBe(versions.length);
  });
});

/**
 * Saat OKUMA ucu — panel iki saati yan yana gösterir (gerçek · sanal).
 *
 * Bu uç M9'da eklendi: sapmayı POST ederek öğrenmek hem yan etkili olurdu hem
 * istek günlüğünü kirletirdi. Uç ölçülmeden yeşil sayılmaz.
 */
describe('saat okuma ucu', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    expect(liveEnv, `${LIVE_REQUIRED}`).toBeTruthy();
    ctx = await startTestApp({ env: { ...liveEnv } });
  });
  afterAll(async () => {
    await ctx?.close();
  });

  const auth = { authorization: `Bearer ${SEED_TENANT_API_KEY}` };

  it('sapma yokken sanal saat gerçek saate eşittir', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/_sandbox/clock', headers: auth });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.offsetMs).toBe(0);
    expect(Math.abs(new Date(body.now).getTime() - new Date(body.real).getTime())).toBeLessThan(2000);
  });

  it('🔑 saat ileri atlayınca OKUMA da atlar — sapma ve `now` birlikte taşınır', async () => {
    const jumpMs = 16 * 24 * 60 * 60 * 1000;
    await ctx.app.inject({
      method: 'POST', url: '/v1/_sandbox/clock', headers: auth,
      payload: { advanceDays: 16 },
    });

    const res = await ctx.app.inject({ method: 'GET', url: '/v1/_sandbox/clock', headers: auth });
    const body = res.json();
    expect(body.offsetMs).toBeGreaterThanOrEqual(jumpMs);

    // 🔴 Asıl ölçüm: `real` GERÇEK zamanda kalır. Panelin iki saati ancak
    // böyle ayrışır; `real` de sanal saatten gelseydi atlama görünmezdi.
    const drift = new Date(body.now).getTime() - new Date(body.real).getTime();
    expect(drift).toBeGreaterThanOrEqual(jumpMs - 2000);
    expect(Math.abs(new Date(body.real).getTime() - Date.now())).toBeLessThan(2000);
  });

  it('okuma ucu kendi günlüğünü kirletmez ve yan etki üretmez', async () => {
    const before = await ctx.app.inject({ method: 'GET', url: '/v1/_sandbox/clock', headers: auth });
    const after = await ctx.app.inject({ method: 'GET', url: '/v1/_sandbox/clock', headers: auth });
    expect(after.json().offsetMs).toBe(before.json().offsetMs);
  });

  it('kimliksiz istek reddedilir', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/_sandbox/clock' });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});
