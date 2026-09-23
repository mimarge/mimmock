/**
 * WEBHOOK — uçtan uca (plan §7, M4 ölçüsü).
 *
 * Plan M4'ün ölçüsü iki cümledir:
 *   *"imza doğrulaması BAĞIMSIZ bir betikle sınanır; ölü-mektup GERÇEKTEN dolar."*
 *
 * İkisi de burada ölçülür. Bağımsız doğrulayıcı `scripts/verify-webhook-signature.mjs`
 * dosyasından import edilir — mock'un kendi `signature.ts`'i DEĞİL.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer as createHttpServer, type Server } from 'node:http';
import { startTestApp, testMimkitEnv, LIVE_REQUIRED, type TestApp } from '../test-support.js';
import { SEED_TENANT_API_KEY, SEED_WEBHOOK_SECRET } from '../seed.js';
import { RETRY_DELAYS_MS, MAX_ATTEMPTS } from './dispatcher.js';
// 🔑 BAĞIMSIZ doğrulayıcı — mock'un kodundan değil, betikten.
// @ts-expect-error — düz .mjs betiği, tip bildirimi yok (bilerek: geliştiricinin
// kopyalayacağı dosya sade kalsın).
import { verify as verifyIndependently } from '../../../scripts/verify-webhook-signature.mjs';

const FIXTURE = join(
  import.meta.dirname,
  '../__fixtures__/fidelity/accept/EFATURA-01-temel-satis.xml',
);
const liveEnv = testMimkitEnv();

interface Received {
  headers: Record<string, string>;
  body: string;
}

/** Gerçek bir HTTP alıcı — fetch taklidi değil; ağ yolu da ölçülsün. */
async function startReceiver(behaviour: {
  status?: number;
  failFirst?: number;
}): Promise<{ url: string; received: Received[]; close: () => Promise<void>; server: Server }> {
  const received: Received[] = [];
  let calls = 0;
  const server = createHttpServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => {
      calls += 1;
      received.push({ headers: request.headers as Record<string, string>, body });
      const shouldFail = behaviour.failFirst !== undefined && calls <= behaviour.failFirst;
      response.writeHead(shouldFail ? 500 : (behaviour.status ?? 200), {
        'content-type': 'application/json',
      });
      response.end('{}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return {
    url: `http://127.0.0.1:${port}/hook`,
    received,
    server,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe('webhook teslimi', () => {
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

  async function createDocument(scenario = 'happy'): Promise<string> {
    counter += 1;
    const xml = readFileSync(FIXTURE, 'utf8')
      .replace(/<cbc:UUID>[^<]*<\/cbc:UUID>/, `<cbc:UUID>${randomUUID()}</cbc:UUID>`)
      .replace(/<cbc:ID>ORN\d+<\/cbc:ID>/, `<cbc:ID>ORN2026${String(counter).padStart(9, '0')}</cbc:ID>`);
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/v1/documents/ubl',
      headers: { ...auth, 'x-company': '1111111111', 'content-type': 'application/xml', 'x-scenario': scenario },
      payload: xml,
    });
    expect(response.statusCode).toBe(202);
    return response.json().id as string;
  }

  async function registerWebhook(url: string, events: string[] = []): Promise<{ id: string; secret: string }> {
    const response = await ctx.app.inject({
      method: 'POST',
      url: '/v1/webhooks',
      headers: auth,
      payload: { url, events },
    });
    expect(response.statusCode).toBe(201);
    return { id: response.json().id, secret: response.json().secret };
  }

  it('tohum webhook K13 gereği HAZIR gelir', async () => {
    const response = await ctx.app.inject({ method: 'GET', url: '/v1/webhooks', headers: auth });
    const hooks = response.json().webhooks;
    expect(hooks.length).toBeGreaterThan(0);
    expect(hooks[0].url).toContain('/v1/_sandbox/webhook-sink');
    expect(hooks[0].secret).toBe(SEED_WEBHOOK_SECRET);
    // Geri çekilme şeması görünür olmalı — geliştirici ne bekleyeceğini bilsin.
    expect(response.json().retryPolicy.maxAttempts).toBe(MAX_ATTEMPTS);
  });

  it('🔑 durum geçişi webhook DOĞURUR ve alıcıya ULAŞIR', async () => {
    const receiver = await startReceiver({});
    try {
      await registerWebhook(receiver.url, ['document.status_changed']);
      const id = await createDocument();

      await ctx.app.inject({ method: 'POST', url: `/v1/_sandbox/documents/${id}/advance`, headers: auth });
      await ctx.dispatcher.drain();

      expect(receiver.received.length).toBeGreaterThan(0);
      const payload = JSON.parse(receiver.received[0]!.body);
      expect(payload.event).toBe('document.status_changed');
      expect(payload.status).toBe('PROCESSING');
      expect(payload.previousStatus).toBe('AWAITING_SIGNATURE');
      expect(payload.transitionId).toBe('G6');
      expect(payload.deliverySemantics).toBe('at-least-once');
    } finally {
      await receiver.close();
    }
  });

  it('🔑 M4 ÖLÇÜSÜ: imza BAĞIMSIZ betikle doğrulanıyor', async () => {
    const receiver = await startReceiver({});
    try {
      const hook = await registerWebhook(receiver.url, ['document.status_changed']);
      const id = await createDocument();
      await ctx.app.inject({ method: 'POST', url: `/v1/_sandbox/documents/${id}/advance`, headers: auth });
      await ctx.dispatcher.drain();

      const first = receiver.received[0];
      expect(first, 'teslim ulaşmadı').toBeTruthy();

      const verdict = verifyIndependently({
        secret: hook.secret,
        timestamp: first!.headers['x-mimmock-timestamp'],
        signature: first!.headers['x-mimmock-signature'],
        body: first!.body,
      });
      expect(verdict, 'bağımsız doğrulayıcı imzayı reddetti').toEqual({ valid: true });

      // Gövdeye tek karakter dokunulunca bağımsız doğrulayıcı DÜŞMELİ.
      const tampered = verifyIndependently({
        secret: hook.secret,
        timestamp: first!.headers['x-mimmock-timestamp'],
        signature: first!.headers['x-mimmock-signature'],
        body: `${first!.body} `,
      });
      expect(tampered.valid).toBe(false);
    } finally {
      await receiver.close();
    }
  });

  it('olay başlıkları sözleşmeye uygun', async () => {
    const receiver = await startReceiver({});
    try {
      await registerWebhook(receiver.url, ['document.status_changed']);
      const id = await createDocument();
      await ctx.app.inject({ method: 'POST', url: `/v1/_sandbox/documents/${id}/advance`, headers: auth });
      await ctx.dispatcher.drain();

      const headers = receiver.received[0]!.headers;
      expect(headers['x-mimmock-event']).toBe('document.status_changed');
      expect(headers['x-mimmock-signature']).toMatch(/^v1=[0-9a-f]{64}$/);
      expect(Number(headers['x-mimmock-timestamp'])).toBeGreaterThan(0);
      expect(Number(headers['x-mimmock-sequence'])).toBeGreaterThan(0);
      expect(headers['x-mimmock-delivery']).toMatch(/^whd_/);
    } finally {
      await receiver.close();
    }
  });

  it('teslim olayı `document.delivered` ayrıca gider', async () => {
    const receiver = await startReceiver({});
    try {
      await registerWebhook(receiver.url, ['document.delivered']);
      const id = await createDocument();
      ctx.clock.advance(30_000);
      await ctx.engine.tick();
      await ctx.dispatcher.drain();

      const events = receiver.received.map((r) => JSON.parse(r.body).event);
      expect(events).toContain('document.delivered');
      void id;
    } finally {
      await receiver.close();
    }
  });

  it('🔑 1230 geri alma `document.rejected` doğurur', async () => {
    const receiver = await startReceiver({});
    try {
      await registerWebhook(receiver.url, ['document.rejected']);
      const id = await createDocument('receiver_reject');
      ctx.clock.advance(60_000);
      await ctx.engine.tick();
      await ctx.dispatcher.drain();

      const bodies = receiver.received.map((r) => JSON.parse(r.body));
      const rejected = bodies.find((b) => b.event === 'document.rejected');
      expect(rejected, 'ret olayı gelmedi').toBeTruthy();
      expect(rejected.rawGibCode).toBe(1230);
      expect(rejected.documentId).toBe(id);
    } finally {
      await receiver.close();
    }
  });

  it('🔴 M4 ÖLÇÜSÜ: ÖLÜ MEKTUP gerçekten dolar', async () => {
    // Hiç ayakta olmayan bir adres: her deneme başarısız.
    const hook = await registerWebhook('http://127.0.0.1:9/hook', ['document.status_changed']);
    const id = await createDocument();
    await ctx.app.inject({ method: 'POST', url: `/v1/_sandbox/documents/${id}/advance`, headers: auth });

    // İlk deneme + her geri çekilme adımı için saati ilerlet.
    await ctx.dispatcher.drain();
    for (const delay of RETRY_DELAYS_MS) {
      ctx.clock.advance(delay + 100);
      await ctx.dispatcher.drain();
    }

    const response = await ctx.app.inject({
      method: 'GET',
      url: `/v1/webhooks/${hook.id}/deliveries`,
      headers: auth,
    });
    const delivery = response.json().deliveries[0];
    expect(delivery.status, 'teslim ölü mektuba düşmeliydi').toBe('dead');
    expect(delivery.attempt).toBe(MAX_ATTEMPTS);
    expect(delivery.nextAttemptAt).toBeNull();
    expect(delivery.error).toBeTruthy();
  });

  it('geri çekilme ÜSTEL — her deneme bir öncekinden uzak', async () => {
    const hook = await registerWebhook('http://127.0.0.1:9/hook', ['document.status_changed']);
    const id = await createDocument();
    await ctx.app.inject({ method: 'POST', url: `/v1/_sandbox/documents/${id}/advance`, headers: auth });
    await ctx.dispatcher.drain();

    const read = async () => {
      const r = await ctx.app.inject({
        method: 'GET', url: `/v1/webhooks/${hook.id}/deliveries`, headers: auth,
      });
      return r.json().deliveries[0];
    };

    const first = await read();
    expect(first.status).toBe('retrying');
    const firstGap = new Date(first.nextAttemptAt).getTime() - ctx.clock.now().getTime();
    expect(firstGap).toBeCloseTo(RETRY_DELAYS_MS[0]!, -2);

    ctx.clock.advance(RETRY_DELAYS_MS[0]! + 100);
    await ctx.dispatcher.drain();
    const second = await read();
    const secondGap = new Date(second.nextAttemptAt).getTime() - ctx.clock.now().getTime();
    expect(secondGap, 'ikinci bekleme birinciden uzun olmalı').toBeGreaterThan(firstGap);
  });

  it('geçici hata sonrası KENDİLİĞİNDEN toparlar (en-az-bir-kez)', async () => {
    const receiver = await startReceiver({ failFirst: 2 });
    try {
      await registerWebhook(receiver.url, ['document.status_changed']);
      const id = await createDocument();
      await ctx.app.inject({ method: 'POST', url: `/v1/_sandbox/documents/${id}/advance`, headers: auth });

      await ctx.dispatcher.drain();
      ctx.clock.advance(RETRY_DELAYS_MS[0]! + 100);
      await ctx.dispatcher.drain();
      ctx.clock.advance(RETRY_DELAYS_MS[1]! + 100);
      await ctx.dispatcher.drain();

      expect(receiver.received.length, 'üç deneme yapılmalıydı').toBe(3);
    } finally {
      await receiver.close();
    }
  });

  it('🔑 ELLE yeniden gönderme ölü mektuptan da çalışır', async () => {
    const receiver = await startReceiver({});
    try {
      // Önce ölü mektuba düşür (alıcı kapalıyken).
      await receiver.close();
      const hook = await registerWebhook(receiver.url, ['document.status_changed']);
      const id = await createDocument();
      await ctx.app.inject({ method: 'POST', url: `/v1/_sandbox/documents/${id}/advance`, headers: auth });
      await ctx.dispatcher.drain();
      for (const delay of RETRY_DELAYS_MS) {
        ctx.clock.advance(delay + 100);
        await ctx.dispatcher.drain();
      }
      let list = await ctx.app.inject({
        method: 'GET', url: `/v1/webhooks/${hook.id}/deliveries`, headers: auth,
      });
      const dead = list.json().deliveries[0];
      expect(dead.status).toBe('dead');

      // Alıcıyı AYNI portta geri getir ve elle yeniden gönder.
      const revived = createHttpServer((_request, response) => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end('{}');
      });
      const port = Number(new URL(receiver.url).port);
      await new Promise<void>((resolve) => revived.listen(port, '127.0.0.1', resolve));
      try {
        const replayed = await ctx.app.inject({
          method: 'POST',
          url: `/v1/webhooks/${hook.id}/replay`,
          headers: auth,
          payload: { deliveryId: dead.id },
        });
        expect(replayed.statusCode).toBe(200);
        expect(replayed.json().status).toBe('delivered');
        expect(replayed.json().attempt, 'sayaç sıfırlanıp tek denemede geçmeli').toBe(1);
      } finally {
        await new Promise<void>((resolve) => revived.close(() => resolve()));
      }
    } finally {
      await receiver.close().catch(() => undefined);
    }
  });

  it('🔴 imza damgası GERÇEK zaman — sanal saat onu kaydırmaz', async () => {
    const receiver = await startReceiver({});
    try {
      const hook = await registerWebhook(receiver.url, ['document.status_changed']);
      // Sanal saati 16 gün ileri at: belge akışı hızlansın.
      ctx.clock.advance(16 * 24 * 60 * 60 * 1000);

      const id = await createDocument();
      await ctx.app.inject({ method: 'POST', url: `/v1/_sandbox/documents/${id}/advance`, headers: auth });
      await ctx.dispatcher.drain();

      const first = receiver.received[0];
      expect(first, 'teslim ulaşmadı').toBeTruthy();

      /*
       * Bağımsız doğrulayıcı GERÇEK saatle bakar. Damga sanal saatten alınsaydı
       * 16 gün ileride olurdu ve "stale" derdi — dışarıdaki her alıcı mock'un
       * webhook'larını reddederdi. Bu test o hatanın geri gelmesini engeller.
       */
      const verdict = verifyIndependently({
        secret: hook.secret,
        timestamp: first!.headers['x-mimmock-timestamp'],
        signature: first!.headers['x-mimmock-signature'],
        body: first!.body,
      });
      expect(verdict, 'gerçek saatli alıcı teslimi reddetti').toEqual({ valid: true });

      ctx.clock.reset();
    } finally {
      await receiver.close();
    }
  });

  it('olay süzgeci çalışır — istenmeyen olay GÖNDERİLMEZ', async () => {
    const receiver = await startReceiver({});
    try {
      await registerWebhook(receiver.url, ['inbox.received']); // belge olayı DEĞİL
      const id = await createDocument();
      await ctx.app.inject({ method: 'POST', url: `/v1/_sandbox/documents/${id}/advance`, headers: auth });
      await ctx.dispatcher.drain();
      expect(receiver.received.length).toBe(0);
    } finally {
      await receiver.close();
    }
  });

  it('KAPI: geçersiz url 400', async () => {
    const response = await ctx.app.inject({
      method: 'POST', url: '/v1/webhooks', headers: auth, payload: { url: 'ftp://olmaz' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().errorCode).toBe('VALIDATION_FAILED');
  });

  it('KAPI: tanınmayan olay adı 400', async () => {
    const response = await ctx.app.inject({
      method: 'POST', url: '/v1/webhooks', headers: auth,
      payload: { url: 'http://127.0.0.1:1/x', events: ['uydurma.olay'] },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().errors[0].reason).toContain('Tanınmayan olay');
  });
});
