/**
 * MOTOR — uçtan uca, sanal saatle (plan §5a).
 *
 * Belge gerçekten ingest'ten geçer (canlı şematron), sonra senaryo boyunca
 * ilerletilir. Ölçülen şey: her adımda durumun ve ham GİB kodunun sözlük §3.1
 * ile aynı olması.
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

describe('motor — senaryolar ve zaman', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    expect(liveEnv, `${LIVE_REQUIRED}`).toBeTruthy();
    ctx = await startTestApp({ env: { ...liveEnv } });
  });
  afterAll(async () => {
    await ctx?.close();
  });

  const auth = { authorization: `Bearer ${SEED_TENANT_API_KEY}` };

  let counter = 0;
  async function createDocument(scenario?: string): Promise<string> {
    counter += 1;
    const xml = readFileSync(FIXTURE, 'utf8')
      .replace(/<cbc:UUID>[^<]*<\/cbc:UUID>/, `<cbc:UUID>${randomUUID()}</cbc:UUID>`)
      .replace(/<cbc:ID>ORN\d+<\/cbc:ID>/, `<cbc:ID>ORN2026${String(counter).padStart(9, '0')}</cbc:ID>`);
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/v1/documents/ubl',
      headers: {
        ...auth,
        'x-company': '1111111111',
        'content-type': 'application/xml',
        ...(scenario ? { 'x-scenario': scenario } : {}),
      },
      payload: xml,
    });
    if (response.statusCode !== 202) {
      throw new Error(`ingest reddetti: ${response.statusCode} ${JSON.stringify(response.json())}`);
    }
    return response.json().id as string;
  }

  async function statusOf(id: string): Promise<{ status: string; rawGibCode: number | null; deliveredAt: string | null }> {
    const read = await ctx.app.inject({ method: 'GET', url: `/v1/documents/${id}`, headers: auth });
    const body = read.json();
    return { status: body.status, rawGibCode: body.rawGibCode, deliveredAt: body.deliveredAt };
  }

  /** Saati ileri atar ve vadesi gelen geçişleri ateşler. */
  async function advanceClock(ms: number): Promise<void> {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/v1/_sandbox/clock',
      headers: auth,
      payload: { advanceMs: ms },
    });
    expect(response.statusCode).toBe(200);
  }

  it('belge ingest\'te AWAITING_SIGNATURE ve senaryoya bağlanır', async () => {
    const id = await createDocument();
    const read = await ctx.app.inject({ method: 'GET', url: `/v1/documents/${id}`, headers: auth });
    const body = read.json();
    expect(body.status).toBe('AWAITING_SIGNATURE');
    expect(body.engine.scenario).toBe('happy');
    expect(body.engine.nextState).toBe('happy#0');
    expect(body.engine.nextAt).toBeTruthy();
  });

  it('🔑 happy: imza → gönderim → 1200 → 1220 TESLİM (sanal saatle)', async () => {
    const id = await createDocument('happy');

    await advanceClock(3000); // sign
    expect((await statusOf(id)).status).toBe('PROCESSING');

    await advanceClock(4000); // submit
    expect((await statusOf(id)).status).toBe('SENT_TO_GIB');

    await advanceClock(6000); // poll 1200 → zaten SENT_TO_GIB, no-op ama iz kalır
    expect((await statusOf(id)).rawGibCode).toBe(1200);

    await advanceClock(11000); // poll 1220 → DELIVERED
    const delivered = await statusOf(id);
    expect(delivered.status).toBe('DELIVERED');
    expect(delivered.rawGibCode).toBe(1220);
    expect(delivered.deliveredAt, 'teslim damgası atılmalı').toBeTruthy();

    await advanceClock(11000); // poll 1300 → zarf kapanışı, belge DEĞİŞMEZ
    const after = await statusOf(id);
    expect(after.status).toBe('DELIVERED');
    expect(after.deliveredAt).toBe(delivered.deliveredAt);
  });

  it('🔴 receiver_reject: 1230 TESLİMİ GERİ ALIR', async () => {
    const id = await createDocument('receiver_reject');
    await advanceClock(60_000); // tüm adımlar vadesi geldi

    const after = await statusOf(id);
    expect(after.status).toBe('SEND_FAILED');
    expect(after.rawGibCode).toBe(1230);
    // 🔑 deliveredAt NULL'a düştü — teslim geri alındı.
    expect(after.deliveredAt).toBeNull();
  });

  it('🔴 gib_stalled: belge ASILI KALIR, FAILED ÜRETİLMEZ', async () => {
    const id = await createDocument('gib_stalled');
    await advanceClock(60_000);

    const mid = await statusOf(id);
    expect(mid.status).toBe('SENT_TO_GIB');
    expect(mid.rawGibCode).toBe(1210);

    // 15 günü bir komutla atla — sadakat bozulmadan bekleme kalkar.
    const response = await ctx.app.inject({
      method: 'POST', url: '/v1/_sandbox/clock', headers: auth, payload: { advanceDays: 16 },
    });
    expect(response.statusCode).toBe(200);
    const alarms = response.json().appliedTransitions.filter((t: { alarm: string | null }) => t.alarm);
    expect(alarms.map((a: { alarm: string }) => a.alarm)).toContain('POLL_DEADLINE');

    const after = await statusOf(id);
    // 🔴 MimForge 15 günde belgeyi KAPATMAZ: alarm + AÇIK-BIRAK.
    expect(after.status).toBe('SENT_TO_GIB');
    expect(after.status).not.toBe('FAILED');
  });

  it('gib_error: terminal-hata → SEND_FAILED (resend yolu açık)', async () => {
    const id = await createDocument('gib_error');
    await advanceClock(60_000);
    const after = await statusOf(id);
    expect(after.status).toBe('SEND_FAILED');
    expect(after.rawGibCode).toBe(1150);
  });

  it('slow: happy ile aynı yol, gecikmeler ×10', async () => {
    const id = await createDocument('slow');
    await advanceClock(30_000); // happy'de teslim için yeterdi
    expect((await statusOf(id)).status).not.toBe('DELIVERED');
    await advanceClock(300_000);
    expect((await statusOf(id)).status).toBe('DELIVERED');
  });

  it('_sandbox/advance tek adım ilerletir (saatten bağımsız)', async () => {
    const id = await createDocument('happy');
    const first = await ctx.app.inject({
      method: 'POST', url: `/v1/_sandbox/documents/${id}/advance`, headers: auth,
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().status).toBe('PROCESSING');
    expect(first.headers['x-mimmock-sandbox']).toBe('1');

    const second = await ctx.app.inject({
      method: 'POST', url: `/v1/_sandbox/documents/${id}/advance`, headers: auth,
    });
    expect(second.json().status).toBe('SENT_TO_GIB');
  });

  it('_sandbox/fail arıza enjekte eder', async () => {
    const id = await createDocument('happy');
    await ctx.app.inject({ method: 'POST', url: `/v1/_sandbox/documents/${id}/advance`, headers: auth });

    const response = await ctx.app.inject({
      method: 'POST',
      url: `/v1/_sandbox/documents/${id}/fail`,
      headers: auth,
      payload: { rawGibCode: 1150, reason: 'şematron reddi denemesi' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('SEND_FAILED');
    expect(response.json().applied.ruleId).toBe('G11');
  });

  it('_sandbox/fail: geçiş üretmeyen kod sessizce yutulmaz, SÖYLENİR', async () => {
    const id = await createDocument('happy');
    const response = await ctx.app.inject({
      method: 'POST',
      url: `/v1/_sandbox/documents/${id}/fail`,
      headers: auth,
      payload: { rawGibCode: 1210 },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().applied).toBeNull();
    expect(response.json().note).toContain('geçiş üretmiyor');
  });

  it('KAPI: bilinmeyen senaryo 400', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/v1/documents/ubl',
      headers: { ...auth, 'x-company': '1111111111', 'content-type': 'application/xml', 'x-scenario': 'uydurma' },
      payload: readFileSync(FIXTURE, 'utf8'),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().errorCode).toBe('VALIDATION_FAILED');
  });

  it('senaryo kataloğu okunabilir', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/v1/_sandbox/scenarios', headers: auth });
    const body = response.json();
    // Geliştiricinin SEÇEBİLECEĞİ senaryolar (giden yol).
    expect(body.selectable).toEqual(['happy', 'receiver_reject', 'gib_stalled', 'gib_error', 'slow']);
    // Katalog gelen yol ve yanıt planlarını da gösterir — motorun ne yürüttüğü okunabilsin.
    const names = body.scenarios.map((s: { name: string }) => s.name);
    expect(names).toContain('inbound_happy');
    expect(names).toContain('inbound_sr_stalled');
    expect(names).toContain('reply_flow');
    const autoOnly = body.scenarios.filter((s: { selectable: boolean }) => !s.selectable);
    expect(autoOnly.map((s: { name: string }) => s.name).sort()).toEqual([
      'inbound_happy', 'inbound_sr_stalled', 'reply_flow',
    ]);
  });

  it('🔴 CAS guard: eşzamanlı iki ilerletmeden YALNIZ biri uygulanır', async () => {
    const id = await createDocument('happy');

    // Aynı adımı iki kez PARALEL uygula. İkisi de aynı `document` anlık
    // görüntüsünü okur; CAS olmasaydı ikisi de yazar ve belge iki adım birden
    // atlardı (ya da geç gelen biri bir öncekini ezerdi). MimForge'un
    // terminal-yazma kilidi tam olarak bunu engelliyor.
    const [a, b] = await Promise.all([
      ctx.engine.advanceOne('tn_seed', id),
      ctx.engine.advanceOne('tn_seed', id),
    ]);

    const appliedCount = [a, b].filter((x) => x !== null).length;
    expect(appliedCount, 'iki paralel ilerletmeden yalnız biri uygulanmalı').toBe(1);
    expect((await statusOf(id)).status).toBe('PROCESSING');
  });

  it('🔴 CAS guard: teslim edilmiş belgeyi geç gelen kod EZEMEZ', async () => {
    const id = await createDocument('happy');
    await advanceClock(30_000); // teslime kadar götür
    const delivered = await statusOf(id);
    expect(delivered.status).toBe('DELIVERED');

    // Geç gelen bir terminal-fail (1215). DELIVERED'dan kuralı YOK → no-op.
    const response = await ctx.app.inject({
      method: 'POST',
      url: `/v1/_sandbox/documents/${id}/fail`,
      headers: auth,
      payload: { rawGibCode: 1215 },
    });
    expect(response.json().applied).toBeNull();

    const after = await statusOf(id);
    expect(after.status).toBe('DELIVERED');
    expect(after.deliveredAt).toBe(delivered.deliveredAt);
  });

  it('_sandbox/reset veriyi sıfırlar ve tohumu geri yazar', async () => {
    await createDocument('happy');
    const before = await ctx.app.inject({ method: 'GET', url: '/v1/documents', headers: auth });
    expect(before.json().page.total).toBeGreaterThan(0);

    const reset = await ctx.app.inject({ method: 'POST', url: '/v1/_sandbox/reset', headers: auth });
    expect(reset.statusCode).toBe(200);
    expect(reset.json().reset).toBe(true);

    const after = await ctx.app.inject({ method: 'GET', url: '/v1/documents', headers: auth });
    expect(after.json().page.total).toBe(0);
    const companies = await ctx.app.inject({ method: 'GET', url: '/v1/companies', headers: auth });
    expect(companies.json().companies.length, 'tohum geri gelmeli').toBe(2);
  });

  it('_sandbox/clock sıfırlanabilir', async () => {
    const response = await ctx.app.inject({
      method: 'POST', url: '/v1/_sandbox/clock', headers: auth, payload: { reset: true },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().offsetMs).toBe(0);
  });

  it('🔑 resend: A sınıfı hatadan SEND_FAILED → PROCESSING', async () => {
    const id = await createDocument('happy');
    await ctx.app.inject({ method: 'POST', url: `/v1/_sandbox/documents/${id}/advance`, headers: auth });
    // 1215 = A sınıfı terminal-fail
    await ctx.app.inject({
      method: 'POST', url: `/v1/_sandbox/documents/${id}/fail`, headers: auth,
      payload: { rawGibCode: 1215 },
    });
    expect((await statusOf(id)).status).toBe('SEND_FAILED');

    const response = await ctx.app.inject({
      method: 'POST', url: `/v1/documents/${id}/resend`, headers: auth,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('PROCESSING');
    expect(response.json().resendClass).toBe('A');
  });

  it('🔴 KAPI: B sınıfı hatada 409 NEEDS_RESIGN', async () => {
    const id = await createDocument('happy');
    await ctx.app.inject({ method: 'POST', url: `/v1/_sandbox/documents/${id}/advance`, headers: auth });
    await ctx.app.inject({
      method: 'POST', url: `/v1/_sandbox/documents/${id}/fail`, headers: auth,
      payload: { rawGibCode: 1150 }, // B: şematron reddi — belge hatalı
    });

    const response = await ctx.app.inject({
      method: 'POST', url: `/v1/documents/${id}/resend`, headers: auth,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().errorCode).toBe('NEEDS_RESIGN');
  });

  it('KAPI: teslim edilmiş belge 409 ALREADY_DELIVERED', async () => {
    const id = await createDocument('happy');
    await advanceClock(30_000);
    expect((await statusOf(id)).status).toBe('DELIVERED');

    const response = await ctx.app.inject({
      method: 'POST', url: `/v1/documents/${id}/resend`, headers: auth,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().errorCode).toBe('ALREADY_DELIVERED');
  });

  it('KAPI: gönderim hattındaki belge 409 SEND_IN_PROGRESS', async () => {
    const id = await createDocument('happy');
    await ctx.app.inject({ method: 'POST', url: `/v1/_sandbox/documents/${id}/advance`, headers: auth });
    expect((await statusOf(id)).status).toBe('PROCESSING');

    const response = await ctx.app.inject({
      method: 'POST', url: `/v1/documents/${id}/resend`, headers: auth,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().errorCode).toBe('SEND_IN_PROGRESS');
  });

  it('KAPI: imza bekleyen belge 409 NOT_RESENDABLE', async () => {
    const id = await createDocument('happy');
    const response = await ctx.app.inject({
      method: 'POST', url: `/v1/documents/${id}/resend`, headers: auth,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().errorCode).toBe('NOT_RESENDABLE');
  });

  it('🔑 durum DB\'de: motor yeniden kurulsa da belge yoluna devam eder', async () => {
    const id = await createDocument('happy');
    await ctx.app.inject({ method: 'POST', url: `/v1/_sandbox/documents/${id}/advance`, headers: auth });
    expect((await statusOf(id)).status).toBe('PROCESSING');

    // Motoru sıfırdan kur (restart benzetimi) — bellekte zamanlayıcı YOK.
    const { createEngine } = await import('./engine.js');
    const fresh = createEngine({ handle: ctx.handle, repo: ctx.repo, clock: ctx.clock });
    ctx.clock.advance(10_000);
    await fresh.tick();
    expect((await statusOf(id)).status).toBe('SENT_TO_GIB');
  });
});
