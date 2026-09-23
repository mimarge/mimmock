/**
 * Tohum webhook alıcısı (`_sandbox/webhook-sink`) — plan K13.
 *
 * Mock kendi webhook'unu kendi yutar. Bu uç yalnız bir kolaylık değil: imzayı
 * GERÇEKTEN doğrular, yani buradaki kayıt imza sözleşmesinin canlı kanıtıdır.
 * Geçersiz imzayı sessizce yutan bir alıcı, bozuk bir imzalayıcıyı görünmez kılar.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startTestApp, testMimkitEnv, LIVE_REQUIRED, type TestApp } from '../test-support.js';
import { SEED_TENANT_API_KEY, SEED_WEBHOOK_SECRET } from '../seed.js';
import { computeSignature } from '../webhooks/signature.js';

const FIXTURE = join(
  import.meta.dirname,
  '../__fixtures__/fidelity/accept/EFATURA-01-temel-satis.xml',
);
const liveEnv = testMimkitEnv();

describe('tohum webhook alıcısı', () => {
  let ctx: TestApp;
  let baseUrl: string;

  beforeAll(async () => {
    expect(liveEnv, `${LIVE_REQUIRED}`).toBeTruthy();
    ctx = await startTestApp({ env: { ...liveEnv } });
    // Gerçek bir port aç: tohum webhook kendi adresimize HTTP ile gidecek.
    await ctx.app.listen({ port: 0, host: '127.0.0.1' });
    const address = ctx.app.server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
    // Tohum webhook 8088'e bakıyor; testte gerçek porta çevir.
    await ctx.handle.execRaw(
      `UPDATE webhooks SET url = '${baseUrl}/v1/_sandbox/webhook-sink' WHERE id = 'wh_seed'`,
    );
  });
  afterAll(async () => {
    await ctx?.close();
  });

  const auth = { authorization: `Bearer ${SEED_TENANT_API_KEY}` };

  it('🔑 K13: belge ilerleyince tohum alıcıya GERÇEK teslim gelir ve imza GEÇERLİ', async () => {
    const xml = readFileSync(FIXTURE, 'utf8')
      .replace(/<cbc:UUID>[^<]*<\/cbc:UUID>/, `<cbc:UUID>${randomUUID()}</cbc:UUID>`)
      .replace(/<cbc:ID>ORN\d+<\/cbc:ID>/, '<cbc:ID>ORN2026000000601</cbc:ID>');

    const created = await ctx.app.inject({
      method: 'POST',
      url: '/v1/documents/ubl',
      headers: { ...auth, 'x-company': '1111111111', 'content-type': 'application/xml' },
      payload: xml,
    });
    expect(created.statusCode).toBe(202);

    await ctx.app.inject({
      method: 'POST',
      url: `/v1/_sandbox/documents/${created.json().id}/advance`,
      headers: auth,
    });
    await ctx.dispatcher.drain();

    const sink = await ctx.app.inject({
      method: 'GET',
      url: '/v1/_sandbox/webhook-sink',
      headers: auth,
    });
    const events = sink.json().events;
    expect(events.length, 'tohum alıcıya hiç olay ulaşmadı').toBeGreaterThan(0);
    expect(events[0].signatureValid, `imza reddedildi: ${events[0].signatureError}`).toBe(true);
    expect(events[0].event).toBe('document.status_changed');
    expect(events[0].sequence).toBeGreaterThan(0);
  });

  it('🔴 KAPI: geçersiz imzalı istek 400 ve kayda GEÇER (sessizce yutulmaz)', async () => {
    const body = JSON.stringify({ event: 'document.status_changed', sahte: true });
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/v1/_sandbox/webhook-sink',
      headers: {
        'content-type': 'application/json',
        'x-mimmock-signature': `v1=${'0'.repeat(64)}`,
        'x-mimmock-timestamp': String(Date.now()),
        'x-mimmock-event': 'document.status_changed',
      },
      payload: body,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().accepted).toBe(false);
    expect(response.json().signature.reason).toBe('mismatch');

    const sink = await ctx.app.inject({
      method: 'GET', url: '/v1/_sandbox/webhook-sink', headers: auth,
    });
    const invalid = sink.json().events.find((e: { signatureValid: boolean }) => !e.signatureValid);
    expect(invalid, 'geçersiz imza kayda geçmeliydi').toBeTruthy();
    expect(invalid.signatureError).toContain('mismatch');
  });

  it('KAPI: imza başlığı hiç yoksa 400', async () => {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/v1/_sandbox/webhook-sink',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ event: 'x' }),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().signature.reason).toBe('missing');
  });

  it('elle kurulmuş DOĞRU imza kabul edilir (sözleşme dışarıdan da uygulanabilir)', async () => {
    const body = JSON.stringify({ event: 'document.delivered', elle: true });
    const timestamp = String(ctx.clock.now().getTime());
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/v1/_sandbox/webhook-sink',
      headers: {
        'content-type': 'application/json',
        'x-mimmock-signature': computeSignature(SEED_WEBHOOK_SECRET, timestamp, body),
        'x-mimmock-timestamp': timestamp,
        'x-mimmock-event': 'document.delivered',
      },
      payload: body,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().accepted).toBe(true);
  });
});
