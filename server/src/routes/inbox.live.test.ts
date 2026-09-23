/**
 * GELEN BELGE — M5 ölçüsü (plan §9).
 *
 * Plan iki şey ölçüyor:
 *   1. *"A→B tam döngü; B tanımsızsa e-Arşiv yoluna düşer."*
 *   2. *"teyit gelmeden yanıt denenince `DOCUMENT_NOT_SETTLED` — tek adımlı
 *      gelen kutusu bu kapıyı hiç öğretmez."*
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

describe('gelen belge — iki adımlı akış', () => {
  let ctx: TestApp;
  let counter = 0;

  beforeAll(async () => {
    expect(liveEnv, `${LIVE_REQUIRED}`).toBeTruthy();
    ctx = await startTestApp({ env: { ...liveEnv } });
  });
  afterAll(async () => {
    await ctx?.close();
  });

  const auth = { authorization: `Bearer ${SEED_TENANT_API_KEY}` };

  /** Ticari fatura üretir — yalnız `TICARIFATURA` yanıtlanabilir. */
  function commercialXml(): string {
    counter += 1;
    return readFileSync(FIXTURE, 'utf8')
      .replace(/<cbc:UUID>[^<]*<\/cbc:UUID>/, `<cbc:UUID>${randomUUID()}</cbc:UUID>`)
      .replace(/<cbc:ID>ORN\d+<\/cbc:ID>/, `<cbc:ID>ORN2026${String(counter).padStart(9, '0')}</cbc:ID>`)
      .replace('<cbc:ProfileID>TEMELFATURA</cbc:ProfileID>', '<cbc:ProfileID>TICARIFATURA</cbc:ProfileID>');
  }

  async function injectInbox(xml: string, scenario?: string): Promise<string> {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/v1/_sandbox/inbox',
      headers: {
        ...auth,
        'x-company': '2222222222',
        'content-type': 'application/xml',
        ...(scenario ? { 'x-scenario': scenario } : {}),
      },
      payload: xml,
    });
    expect(response.statusCode, JSON.stringify(response.json())).toBe(202);
    return response.json().id as string;
  }

  async function readInbox(id: string) {
    const r = await ctx.app.inject({ method: 'GET', url: `/v1/inbox/${id}`, headers: auth });
    return r.json();
  }

  it('🔑 BİRİNCİ ADIM: enjekte edilen belge RECEIVED, DELIVERED DEĞİL', async () => {
    const id = await injectInbox(commercialXml(), 'inbound_sr_stalled');
    const doc = await readInbox(id);
    expect(doc.status).toBe('RECEIVED');
    expect(doc.replyStatus).toBe('AWAITING');
    expect(doc.systemResponse.confirmedAt).toBeNull();
    expect(doc.deliveredAt).toBeNull();
  });

  it('🔴 M5 ÖLÇÜSÜ: teyit gelmeden yanıt → 409 DOCUMENT_NOT_SETTLED', async () => {
    const id = await injectInbox(commercialXml(), 'inbound_sr_stalled');
    // S_APR gönderildi ama TEYİT gelmedi (H8).
    ctx.clock.advance(10_000);
    await ctx.engine.tick();

    const doc = await readInbox(id);
    expect(doc.status, 'belge hâlâ RECEIVED olmalı').toBe('RECEIVED');
    expect(doc.systemResponse.sentAt, 'S_APR gönderilmiş olmalı').toBeTruthy();
    expect(doc.systemResponse.confirmedAt, 'ama teyit GELMEMELİ').toBeNull();
    // Kapı yanıt verilmeden ÖNCE de görünür.
    expect(doc.replyable).toEqual({ can: false, reason: 'DOCUMENT_NOT_SETTLED' });

    const response = await ctx.app.inject({
      method: 'POST',
      url: `/v1/inbox/${id}/reply`,
      headers: auth,
      payload: { decision: 'ACCEPTED' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().errorCode).toBe('DOCUMENT_NOT_SETTLED');
  });

  it('🔑 İKİNCİ ADIM: S_APR teyidi gelince DELIVERED ve yanıtlanabilir', async () => {
    const id = await injectInbox(commercialXml());
    ctx.clock.advance(30_000);
    await ctx.engine.tick();

    const doc = await readInbox(id);
    expect(doc.status).toBe('DELIVERED');
    expect(doc.systemResponse.confirmedAt).toBeTruthy();
    // Teyit kodu 1200 — GELEN yolda bu TEYİTTİR (giden yolda ara eşiktir).
    expect(doc.systemResponse.code).toBe(1200);
    expect(doc.deliveredAt).toBeTruthy();
    expect(doc.replyable).toEqual({ can: true, reason: null });
  });

  it('ticari kabul: AWAITING → REPLY_IN_PROGRESS → ACCEPTED', async () => {
    const id = await injectInbox(commercialXml());
    ctx.clock.advance(30_000);
    await ctx.engine.tick();

    const opened = await ctx.app.inject({
      method: 'POST', url: `/v1/inbox/${id}/reply`, headers: auth,
      payload: { decision: 'ACCEPTED' },
    });
    expect(opened.statusCode).toBe(200);
    expect(opened.json().replyStatus).toBe('REPLY_IN_PROGRESS');

    // Yanıt zarfı 1300 ile kapanır (Y2).
    ctx.clock.advance(10_000);
    await ctx.engine.tick();
    const settled = await readInbox(id);
    expect(settled.replyStatus).toBe('ACCEPTED');
    expect(settled.rawGibCode).toBe(1300);
    // Belge DURUMU değişmedi — yanıt AYRI eksendir.
    expect(settled.status).toBe('DELIVERED');
  });

  it('ticari ret: gerekçe saklanır', async () => {
    const id = await injectInbox(commercialXml());
    ctx.clock.advance(30_000);
    await ctx.engine.tick();

    await ctx.app.inject({
      method: 'POST', url: `/v1/inbox/${id}/reply`, headers: auth,
      payload: { decision: 'REJECTED', reason: 'Mal teslim alınmadı' },
    });
    ctx.clock.advance(10_000);
    await ctx.engine.tick();

    const doc = await readInbox(id);
    expect(doc.replyStatus).toBe('REJECTED');
    expect(doc.replyReason).toBe('Mal teslim alınmadı');
  });

  it('KAPI: gerekçesiz ret 400 EMPTY_REJECT_REASON', async () => {
    const id = await injectInbox(commercialXml());
    ctx.clock.advance(30_000);
    await ctx.engine.tick();

    const response = await ctx.app.inject({
      method: 'POST', url: `/v1/inbox/${id}/reply`, headers: auth,
      payload: { decision: 'REJECTED' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().errorCode).toBe('EMPTY_REJECT_REASON');
  });

  it('KAPI: TEMELFATURA yanıtlanamaz → 409 NOT_COMMERCIAL', async () => {
    counter += 1;
    const xml = readFileSync(FIXTURE, 'utf8')
      .replace(/<cbc:UUID>[^<]*<\/cbc:UUID>/, `<cbc:UUID>${randomUUID()}</cbc:UUID>`)
      .replace(/<cbc:ID>ORN\d+<\/cbc:ID>/, `<cbc:ID>ORN2026${String(counter).padStart(9, '0')}</cbc:ID>`);
    const id = await injectInbox(xml); // TEMELFATURA
    ctx.clock.advance(30_000);
    await ctx.engine.tick();

    const doc = await readInbox(id);
    // Yanıt kavramı hiç doğmadı (sözlük §3.2 L9).
    expect(doc.replyStatus).toBe('NONE');

    const response = await ctx.app.inject({
      method: 'POST', url: `/v1/inbox/${id}/reply`, headers: auth,
      payload: { decision: 'ACCEPTED' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().errorCode).toBe('NOT_COMMERCIAL');
  });

  it('KAPI: ikinci yanıt denemesi 409', async () => {
    const id = await injectInbox(commercialXml());
    ctx.clock.advance(30_000);
    await ctx.engine.tick();
    await ctx.app.inject({
      method: 'POST', url: `/v1/inbox/${id}/reply`, headers: auth, payload: { decision: 'ACCEPTED' },
    });
    const second = await ctx.app.inject({
      method: 'POST', url: `/v1/inbox/${id}/reply`, headers: auth, payload: { decision: 'ACCEPTED' },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().errorCode).toBe('REPLY_IN_PROGRESS');
  });

  it('KAPI: 8 günlük pencere dolunca 409 REPLY_WINDOW_EXPIRED', async () => {
    const id = await injectInbox(commercialXml());
    ctx.clock.advance(30_000);
    await ctx.engine.tick();
    // TTK md.21 — 8 gün.
    ctx.clock.advance(9 * 24 * 60 * 60 * 1000);

    const response = await ctx.app.inject({
      method: 'POST', url: `/v1/inbox/${id}/reply`, headers: auth,
      payload: { decision: 'ACCEPTED' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().errorCode).toBe('REPLY_WINDOW_EXPIRED');
    ctx.clock.reset();
  });

  it('KAPI: aynı ETTN ikinci kez enjekte edilemez', async () => {
    const xml = commercialXml();
    await injectInbox(xml);
    const second = await ctx.app.inject({
      method: 'POST', url: '/v1/_sandbox/inbox',
      headers: { ...auth, 'x-company': '2222222222', 'content-type': 'application/xml' },
      payload: xml,
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().errorCode).toBe('DUPLICATE_UUID');
  });

  it('KAPI: X-Company yoksa 400 BRANCH_REQUIRED', async () => {
    const response = await ctx.app.inject({
      method: 'POST', url: '/v1/_sandbox/inbox',
      headers: { ...auth, 'content-type': 'application/xml' },
      payload: commercialXml(),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().errorCode).toBe('BRANCH_REQUIRED');
  });
});
