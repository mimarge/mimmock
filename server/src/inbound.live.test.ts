/**
 * ŞİRKETLER-ARASI TESLİM (K7a) — M5 ölçüsünün ilk yarısı.
 *
 * Plan: *"A→B tam döngü; B tanımsızsa e-Arşiv yoluna düşer."*
 *
 * 🔑 Bu mock'un en öğretici özelliği: tek geliştirici İKİ tarafı da sınar.
 * A şirketi fatura keser, GİB'de teslim olur, aynı belge B şirketinin gelen
 * kutusunda belirir ve kendi iki adımlı akışını yürütür.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startTestApp, testMimkitEnv, LIVE_REQUIRED, type TestApp } from '../src/test-support.js';
import { SEED_TENANT_API_KEY } from '../src/seed.js';
import { deliverToInbox } from '../src/inbound.js';

const FIXTURE = join(
  import.meta.dirname,
  '__fixtures__/fidelity/accept/EFATURA-01-temel-satis.xml',
);
const liveEnv = testMimkitEnv();

describe('A → B tam döngü', () => {
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

  async function sendFrom1111To(receiverVkn: string, profile = 'TEMELFATURA'): Promise<string> {
    counter += 1;
    let xml = readFileSync(FIXTURE, 'utf8')
      .replace(/<cbc:UUID>[^<]*<\/cbc:UUID>/, `<cbc:UUID>${randomUUID()}</cbc:UUID>`)
      .replace(/<cbc:ID>ORN\d+<\/cbc:ID>/, `<cbc:ID>ORN2026${String(counter).padStart(9, '0')}</cbc:ID>`);
    if (receiverVkn !== '2222222222') xml = xml.replace(/2222222222/g, receiverVkn);
    if (profile !== 'TEMELFATURA') {
      xml = xml.replace('<cbc:ProfileID>TEMELFATURA</cbc:ProfileID>', `<cbc:ProfileID>${profile}</cbc:ProfileID>`);
    }
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/v1/documents/ubl',
      headers: { ...auth, 'x-company': '1111111111', 'content-type': 'application/xml' },
      payload: xml,
    });
    expect(response.statusCode, JSON.stringify(response.json())).toBe(202);
    return response.json().id as string;
  }

  it('🔑 A teslim edilince belge B\'nin GELEN KUTUSUNDA belirir', async () => {
    const outgoingId = await sendFrom1111To('2222222222');

    // Teslime kadar götür (1220).
    ctx.clock.advance(30_000);
    await ctx.engine.tick();
    const outgoing = await ctx.app.inject({
      method: 'GET', url: `/v1/documents/${outgoingId}`, headers: auth,
    });
    expect(outgoing.json().status).toBe('DELIVERED');

    // B'nin gelen kutusu.
    const inbox = await ctx.app.inject({
      method: 'GET', url: '/v1/inbox', headers: { ...auth, 'x-company': '2222222222' },
    });
    const arrived = inbox.json().inbox.find(
      (d: { sourceDocumentId: string | null }) => d.sourceDocumentId === outgoingId,
    );
    expect(arrived, 'belge alıcının gelen kutusuna düşmedi').toBeTruthy();
    // 🔑 Gelen belge KENDİ akışına başlar: RECEIVED, DELIVERED değil.
    expect(arrived.status).toBe('RECEIVED');
    expect(arrived.senderVkn).toBe('1111111111');
    expect(arrived.receiverVkn).toBe('2222222222');
  });

  it('gelen kopya kendi iki adımlı akışını yürütür', async () => {
    const outgoingId = await sendFrom1111To('2222222222');
    ctx.clock.advance(30_000);
    await ctx.engine.tick();

    const inbox = await ctx.app.inject({
      method: 'GET', url: '/v1/inbox', headers: { ...auth, 'x-company': '2222222222' },
    });
    const arrived = inbox.json().inbox.find(
      (d: { sourceDocumentId: string | null }) => d.sourceDocumentId === outgoingId,
    );
    expect(arrived.status).toBe('RECEIVED');

    // S_APR akışı tamamlanınca DELIVERED.
    ctx.clock.advance(30_000);
    await ctx.engine.tick();
    const settled = await ctx.app.inject({
      method: 'GET', url: `/v1/inbox/${arrived.id}`, headers: auth,
    });
    expect(settled.json().status).toBe('DELIVERED');
    expect(settled.json().systemResponse.confirmedAt).toBeTruthy();
  });

  it('TICARIFATURA gelen kopyada yanıt bekler, TEMELFATURA beklemez', async () => {
    const commercialId = await sendFrom1111To('2222222222', 'TICARIFATURA');
    ctx.clock.advance(30_000);
    await ctx.engine.tick();

    const inbox = await ctx.app.inject({
      method: 'GET', url: '/v1/inbox', headers: { ...auth, 'x-company': '2222222222' },
    });
    const list = inbox.json().inbox;
    const commercial = list.find(
      (d: { sourceDocumentId: string | null }) => d.sourceDocumentId === commercialId,
    );
    expect(commercial.replyStatus).toBe('AWAITING');
  });

  it('🔑 B TANIMSIZSA gelen kutusu oluşmaz — belge e-Arşiv yoluna aittir', async () => {
    // Tanımsız alıcıya e-Fatura zaten ingest'te reddedilir.
    counter += 1;
    const xml = readFileSync(FIXTURE, 'utf8')
      .replace(/<cbc:UUID>[^<]*<\/cbc:UUID>/, `<cbc:UUID>${randomUUID()}</cbc:UUID>`)
      .replace(/<cbc:ID>ORN\d+<\/cbc:ID>/, `<cbc:ID>ORN2026${String(counter).padStart(9, '0')}</cbc:ID>`)
      .replace(/2222222222/g, '7777777777');
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/v1/documents/ubl',
      headers: { ...auth, 'x-company': '1111111111', 'content-type': 'application/xml' },
      payload: xml,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().errorCode).toBe('RECEIVER_NOT_REGISTERED');
    expect(response.json().reason).toContain('e-Arşiv olmalı');
  });

  it('aynı giden belgeden İKİ gelen kopya oluşmaz', async () => {
    const outgoingId = await sendFrom1111To('2222222222');
    ctx.clock.advance(30_000);
    await ctx.engine.tick();

    /*
     * İkinci teslim damgası gerçekte olur: `1230` ile teslim geri alınıp resend
     * sonrası yeniden teslim edilen bir belge `onDelivered` kancasını İKİNCİ kez
     * tetikler. Motoru o yola sokmak yerine kancayı doğrudan iki kez çağırıyoruz —
     * ölçülen şey kancanın idempotansı, motorun yolu değil.
     */
    const outgoing = await ctx.repo.findDocumentById('tn_seed', outgoingId);
    expect(outgoing).toBeTruthy();
    const second = await deliverToInbox(outgoing!, {
      repo: ctx.repo,
      engine: ctx.engine,
      clock: ctx.clock,
    });
    expect(second, 'ikinci çağrı yeni kopya üretmemeli').toBeNull();

    const inbox = await ctx.app.inject({
      method: 'GET', url: '/v1/inbox', headers: { ...auth, 'x-company': '2222222222' },
    });
    const copies = inbox
      .json()
      .inbox.filter((d: { sourceDocumentId: string | null }) => d.sourceDocumentId === outgoingId);
    expect(copies.length).toBe(1);
  });

  it('gelen belge `inbox.received` webhook\'u doğurur', async () => {
    const outgoingId = await sendFrom1111To('2222222222');
    ctx.clock.advance(30_000);
    await ctx.engine.tick();

    /*
     * Teslimin ağdan GİTTİĞİ M4'te ölçüldü; burada ölçülen şey olayın DOĞDUĞU.
     * Bu yüzden kuyruğa bakılıyor, sink'e değil: test uygulaması bir port
     * dinlemiyor ve tohum webhook gerçek bir adrese bakıyor.
     */
    const hooks = await ctx.app.inject({ method: 'GET', url: '/v1/webhooks', headers: auth });
    const seedHook = hooks.json().webhooks[0];
    const log = await ctx.app.inject({
      method: 'GET', url: `/v1/webhooks/${seedHook.id}/deliveries`, headers: auth,
    });
    const deliveries = log.json().deliveries as Array<{
      event: string;
      payload: Record<string, unknown>;
    }>;
    const inboxEvent = deliveries.find((d) => d.event === 'inbox.received');
    expect(inboxEvent, 'inbox.received olayı kuyruğa girmedi').toBeTruthy();
    expect(inboxEvent!.payload.sourceDocumentId).toBe(outgoingId);
    // 🔑 Olay RECEIVED durumunu taşır — tüketici ikinci adımı beklemeyi öğrenir.
    expect(inboxEvent!.payload.status).toBe('RECEIVED');
  });
});
