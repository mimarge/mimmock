/**
 * Fastify kompozisyon kökü.
 *
 * Plan §0-2: her yanıt `X-MimMock-Api: 1` taşır. Bu bir nezaket değil, ad
 * karışıklığını YAPISAL olarak önleyen tedbirdir — bu yüzey "MimForge API v1"
 * DEĞİLDİR, `mimmock` API v1'dir ve geçicidir.
 */
import { existsSync } from 'node:fs';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import { MimMockError } from './errors.js';
import { authenticate, type AuthContext } from './auth.js';
import { registerCompanyRoutes } from './routes/companies.js';
import { registerDocumentRoutes } from './routes/documents.js';
import { registerSandboxRoutes } from './routes/sandbox.js';
import { registerWebhookRoutes } from './routes/webhooks.js';
import { registerInboxRoutes } from './routes/inbox.js';
import { registerRenderRoutes } from './routes/render.js';
import { deliverToInbox } from './inbound.js';
import { createTrafficGenerator, type TrafficGenerator } from './traffic/generator.js';
import {
  registerRequestLog,
  registerObservabilityRoutes,
  recordTransition,
} from './observability.js';
import { createDispatcher, type Dispatcher, type WebhookEvent } from './webhooks/dispatcher.js';
import { createEngine, type Engine } from './engine/engine.js';
import { createClock, type Clock } from './engine/clock.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerDocsRoutes } from './docs/routes.js';
import type { AppConfig } from './config.js';
import type { DbHandle } from './db/client.js';
import type { Kittest } from './kittest/index.js';
import { createRepo } from './db/repo.js';
import type { AppDeps } from './deps.js';

export const MIMMOCK_API_VERSION = '1';

declare module 'fastify' {
  interface FastifyRequest {
    /** Kimliği çözer; başarısızsa `MimMockError` fırlatır. */
    authenticate(): Promise<AuthContext>;
  }
}

export interface ServerParts {
  app: FastifyInstance;
  engine: Engine;
  clock: Clock;
  dispatcher: Dispatcher;
  traffic: TrafficGenerator | null;
  /**
   * Kayıtlı rotalar. OpenAPI eşlik testi bunu okur: belgede olmayan bir uç ya da
   * sunucuda olmayan bir belge satırı sessiz kalamaz.
   */
  routes: ReadonlyArray<{ method: string; url: string }>;
}

export function buildServer(
  config: AppConfig,
  handle: DbHandle,
  kittest: Kittest,
  kittestReady: boolean,
): FastifyInstance {
  return buildServerParts(config, handle, kittest, kittestReady).app;
}

export function buildServerParts(
  config: AppConfig,
  handle: DbHandle,
  kittest: Kittest,
  kittestReady: boolean,
): ServerParts {
  const repo = createRepo(handle);
  const clock = createClock();
  const observability = { handle, clock, limit: 500 };
  const dispatcher = createDispatcher({ handle, clock });

  /*
   * Motor her geçişte webhook üretir (plan §7). Olay adı geçişin SONUCUNDAN
   * türetilir; `document.status_changed` her zaman gider, teslim/ret ayrıca
   * kendi olaylarını doğurur — tüketici tek bir olayı dinleyerek de yaşayabilsin.
   */
  /** Motor kendi kancasında kendine ihtiyaç duyar (gelen belge yaratır). */
  const engineRef: { current: Engine | null } = { current: null };
  const engine = createEngine({
    handle,
    repo,
    clock,
    /*
     * K7a — şirketler-arası teslim. Giden belge GİB'de teslim edildiğinde
     * (1220 → DELIVERED), alıcı bu kiracıda TANIMLIYSA gelen kutusuna düşer.
     * Tanımlı değilse hiçbir şey olmaz: o belge zaten e-Arşiv yolundadır.
     */
    onDelivered: async (outcome) => {
      const outgoing = await repo.findDocumentById(outcome.tenantId, outcome.documentId);
      if (!outgoing) return;
      const inbound = await deliverToInbox(outgoing, { repo, engine: engineRef.current!, clock });
      if (!inbound) return;
      await dispatcher.enqueue({
        tenantId: inbound.tenantId,
        companyId: inbound.companyId,
        event: 'inbox.received',
        documentId: inbound.id,
        documentVersion: inbound.version,
        payload: {
          event: 'inbox.received',
          documentId: inbound.id,
          ettn: inbound.ettn,
          /** 🔑 RECEIVED — henüz DELIVERED değil (iki adımlı akış). */
          status: inbound.status,
          replyStatus: inbound.replyStatus,
          senderVkn: inbound.senderVkn,
          receiverVkn: inbound.receiverVkn,
          sourceDocumentId: inbound.sourceDocumentId,
          occurredAt: clock.now().toISOString(),
          deliverySemantics: 'at-least-once',
        },
      });
    },
    onTransition: async (outcome) => {
      // Önce geçmişe yaz: panelin "neden oldu" cevabı buradan gelir.
      await recordTransition(observability, outcome);

      const events: WebhookEvent[] = ['document.status_changed'];
      if (outcome.to === 'DELIVERED') events.push('document.delivered');
      // 🔑 `1230` teslim geri alma: bu bir REDDİR, tüketici böyle duymalı.
      if (outcome.rawGibCode === 1230 && outcome.to === 'SEND_FAILED') {
        events.push('document.rejected');
      }
      for (const event of events) {
        await dispatcher.enqueue({
          tenantId: outcome.tenantId,
          companyId: outcome.companyId,
          event,
          documentId: outcome.documentId,
          documentVersion: outcome.documentVersion,
          payload: {
            event,
            documentId: outcome.documentId,
            documentVersion: outcome.documentVersion,
            status: outcome.to,
            previousStatus: outcome.from,
            rawGibCode: outcome.rawGibCode,
            alarm: outcome.alarm,
            transitionId: outcome.ruleId,
            occurredAt: outcome.at.toISOString(),
            /** Plan §7: teslim EN AZ BİR KEZ — tüketici idempotent olmalı. */
            deliverySemantics: 'at-least-once',
          },
        });
      }
    },
  });
  const panelIndex = `${config.panelDistDir}/index.html`;
  const panelAvailable = existsSync(panelIndex);
  engineRef.current = engine;

  /*
   * Trafik üreteci GERÇEK UBL üretir ve canlı şematrondan geçirir (plan §5b).
   * Doğrulayıcı olmadan "üretilmiş trafik" sahte gövde demektir; o yüzden
   * mimkit hazır değilse üreteç hiç kurulmaz — sessiz düşük sadakat YOK.
   */
  const traffic = kittestReady
    ? createTrafficGenerator(
        {
          handle,
          repo,
          engine,
          clock,
          validator: kittest.validator,
          onGenerated: async (document, scenarioName) => {
            await dispatcher.enqueue({
              tenantId: document.tenantId,
              companyId: document.companyId,
              event: 'inbox.received',
              documentId: document.id,
              documentVersion: document.version,
              payload: {
                event: 'inbox.received',
                documentId: document.id,
                ettn: document.ettn,
                status: document.status,
                replyStatus: document.replyStatus,
                senderVkn: document.senderVkn,
                receiverVkn: document.receiverVkn,
                /** 🔑 Üretilmiş trafik AÇIKÇA işaretli — webhook'ta da. */
                generated: true,
                generatedScenario: scenarioName,
                occurredAt: clock.now().toISOString(),
                deliverySemantics: 'at-least-once',
              },
            });
          },
        },
        { seed: config.trafficSeed, burst: config.trafficBurst },
      )
    : null;

  const deps: AppDeps = {
    config, handle, repo, kittest, kittestReady, engine, clock, dispatcher, traffic,
    panelAvailable,
  };

  const app = Fastify({ logger: { level: config.logLevel } });

  const routes: Array<{ method: string; url: string }> = [];
  app.addHook('onRoute', (route) => {
    for (const method of [route.method].flat()) routes.push({ method: String(method), url: route.url });
  });

  // Ad karışıklığı tedbiri (§0-2) — istisnasız her yanıtta.
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-MimMock-Api', MIMMOCK_API_VERSION);
    /*
     * RFC 8631: API yanıtı kendi belgesini gösterir. Bir ajan yalnız bir uca
     * dokunduysa bile sözleşmeyi (service-desc) ve kılavuzu (describedby) bulur.
     */
    if (request.url.startsWith('/v1')) {
      reply.header(
        'Link',
        '</openapi.json>; rel="service-desc"; type="application/json", ' +
          '</llms-full.txt>; rel="describedby"; type="text/markdown", ' +
          '</docs>; rel="service-doc"; type="text/html"',
      );
    }
    return payload;
  });

  app.decorateRequest('authenticate', function (this: FastifyRequest) {
    /*
     * Kimlik çözülünce kiracıyı isteğe iliştiriyoruz: istek günlüğü onu kiracı
     * bazında süzebilsin. Çözülemeyen istekler de (401) günlüğe girer —
     * "anahtarım neden çalışmıyor" sorusunun cevabı orada.
     */
    return authenticate(this, repo, config).then((auth) => {
      (this as { loggedTenantId?: string }).loggedTenantId = auth.tenant.id;
      return auth;
    });
  });

  registerRequestLog(app, observability);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof MimMockError) {
      reply.code(error.status).send(error.toBody());
      return;
    }
    // Gövde JSON değilse Fastify kendi hatasını verir; sözleşmemize çeviriyoruz.
    if ((error as { statusCode?: number }).statusCode === 400) {
      const message = error instanceof Error ? error.message : 'Gövde okunamadı.';
      reply.code(400).send(new MimMockError('VALIDATION_FAILED', { reason: message }).toBody());
      return;
    }
    request.log.error({ err: error }, 'beklenmeyen hata');
    reply.code(500).send(new MimMockError('INTERNAL').toBody());
  });

  app.setNotFoundHandler((request, reply) => {
    // Panel SPA yolları: derleme varsa index.html'e düşür.
    if (panelAvailable && request.method === 'GET' && !request.url.startsWith('/v1/')) {
      reply.sendFile('index.html');
      return;
    }
    reply.code(404).send(new MimMockError('NOT_FOUND').toBody());
  });

  /*
   * 🔴 Boş gövde + `content-type: application/json` = `{}`.
   * Canlı ölçümde yakalandı: Fastify'ın varsayılanı bunu 400 ile reddediyordu ve
   * gövde istemeyen uçlar (`/traffic`, `/advance`, `/reset`) başlığı her isteğe
   * koyan istemcilerde — panelin kendisi dahil — bozuk görünüyordu. Bozuk JSON
   * hâlâ reddedilir; tolerans yalnız BOŞ gövdeye.
   */
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
    const text = typeof body === 'string' ? body : body.toString('utf8');
    if (text.trim() === '') {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(text));
    } catch {
      const error = new Error('Gövde geçerli JSON değil.') as Error & { statusCode: number };
      error.statusCode = 400;
      done(error, undefined);
    }
  });

  // Ham UBL ucu için: application/xml gövdesi metin olarak okunur.
  app.addContentTypeParser(
    ['application/xml', 'text/xml'],
    { parseAs: 'string' },
    (_request, body, done) => done(null, body),
  );

  registerHealthRoutes(app, deps);
  registerDocsRoutes(app);
  registerCompanyRoutes(app, deps);
  registerDocumentRoutes(app, deps);
  registerSandboxRoutes(app, deps);
  registerWebhookRoutes(app, deps);
  registerInboxRoutes(app, deps);
  registerRenderRoutes(app, deps);
  registerObservabilityRoutes(app, observability);

  if (panelAvailable) {
    app.register(fastifyStatic, { root: config.panelDistDir, prefix: '/' });
  }

  return { app, engine, clock, dispatcher, traffic, routes };
}
