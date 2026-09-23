/**
 * `/v1/_sandbox` — YALNIZ MOCK'TA VAR (plan K11).
 *
 * Ayrı ad alanında durmasının gerekçesi plandadır: zaman/arıza kumandası API'den
 * erişilebilir olmalı (yoksa otomatik test yazılamaz), ama kimse canlıda bu uçlara
 * kod yazmasın. Yanıtlar `X-MimMock-Sandbox: 1` başlığı da taşır.
 */
import type { FastifyInstance } from 'fastify';
import { MimMockError } from '../errors.js';
import { requireCompany } from '../auth.js';
import { createInboundDocument } from '../inbound.js';
import { isScenarioName, SCENARIOS, SELECTABLE_SCENARIOS } from '../engine/scenarios.js';
import { dropSchemaStatements } from '../db/client.js';
import { createSchemaStatements } from '../db/ddl.js';
import { seedIfEmpty } from '../seed.js';
import type { AppDeps } from '../deps.js';

export function registerSandboxRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { repo, engine, clock, handle, config } = deps;

  app.addHook('onSend', async (request, reply, payload) => {
    if (request.url.startsWith('/v1/_sandbox')) reply.header('X-MimMock-Sandbox', '1');
    return payload;
  });

  /**
   * Senaryo kataloğu — geliştirici ne seçebileceğini görsün.
   * `selectable`: belge oluştururken `X-Scenario` ile verilebilir mi. Gelen yol
   * ve yanıt akışı planları mock tarafından OTOMATİK bağlanır; listede görünürler
   * ki geliştirici motorun ne yürüttüğünü okuyabilsin.
   */
  app.get('/v1/_sandbox/scenarios', async (request) => {
    await request.authenticate();
    return {
      selectable: [...SELECTABLE_SCENARIOS],
      scenarios: Object.values(SCENARIOS).map((s) => ({
        selectable: (SELECTABLE_SCENARIOS as readonly string[]).includes(s.name),
        name: s.name,
        description: s.description,
        steps: s.steps.map((step) => ({
          event: step.event,
          rawGibCode: step.rawGibCode ?? null,
          delayMs: step.delayMs,
          alarm: step.alarm ?? null,
          note: step.note ?? null,
        })),
        endsOpen: s.endsOpen === true,
      })),
    };
  });

  /** Belgeyi bir adım ilerlet. */
  app.post<{ Params: { id: string } }>(
    '/v1/_sandbox/documents/:id/advance',
    async (request) => {
      const auth = await request.authenticate();
      const document = await repo.findDocumentById(auth.tenant.id, request.params.id);
      if (!document) throw new MimMockError('DOCUMENT_NOT_FOUND');

      const outcome = await engine.advanceOne(auth.tenant.id, request.params.id);
      const after = await repo.findDocumentById(auth.tenant.id, request.params.id);
      return {
        applied: outcome,
        status: after?.status ?? document.status,
        rawGibCode: after?.rawGibCode ?? null,
        nextState: after?.nextState ?? null,
        nextAt: after?.nextAt?.toISOString() ?? null,
      };
    },
  );

  /** Arıza enjekte et: verilen ham GİB kodu poll gibi uygulanır. */
  app.post<{ Params: { id: string }; Body: { rawGibCode?: unknown; reason?: unknown } }>(
    '/v1/_sandbox/documents/:id/fail',
    async (request) => {
      const auth = await request.authenticate();
      const body = (request.body ?? {}) as Record<string, unknown>;
      const rawGibCode = Number(body.rawGibCode);
      if (!Number.isInteger(rawGibCode)) {
        throw new MimMockError('VALIDATION_FAILED', {
          errors: [{ field: 'rawGibCode', reason: 'Tam sayı GİB kodu gerekli (örn. 1150, 1230).' }],
        });
      }
      const document = await repo.findDocumentById(auth.tenant.id, request.params.id);
      if (!document) throw new MimMockError('DOCUMENT_NOT_FOUND');

      const reason = typeof body.reason === 'string' ? body.reason : undefined;
      const outcome = await engine.injectFailure(
        auth.tenant.id,
        request.params.id,
        rawGibCode,
        reason,
      );
      const after = await repo.findDocumentById(auth.tenant.id, request.params.id);
      return {
        applied: outcome,
        status: after?.status ?? document.status,
        rawGibCode: after?.rawGibCode ?? null,
        /*
         * Geçiş olmadıysa bu bir hata DEĞİLDİR: ara kodlar (1000/1100/1210) belgeye
         * dokunmaz, yalnız poll izi bırakır — MimForge de öyle yapar.
         */
        note: outcome ? undefined : 'Bu kod bu durumda geçiş üretmiyor; yalnız poll izi işlendi.',
      };
    },
  );

  /**
   * Saatin OKUNMASI. Panel iki saati yan yana gösterir (gerçek · sanal); sapmayı
   * POST ederek öğrenmek günlüğü kirletirdi, o yüzden ayrı bir okuma ucu var.
   */
  app.get('/v1/_sandbox/clock', async (request) => {
    await request.authenticate();
    return {
      now: clock.now().toISOString(),
      offsetMs: clock.offsetMs(),
      real: new Date().toISOString(),
    };
  });

  /** Saat kumandası: sanal zamanı ileri atar, vadesi geleni ateşler. */
  app.post<{ Body: { advanceMs?: unknown; advanceDays?: unknown; to?: unknown; reset?: unknown } }>(
    '/v1/_sandbox/clock',
    async (request) => {
      await request.authenticate();
      const body = (request.body ?? {}) as Record<string, unknown>;

      if (body.reset === true) {
        clock.reset();
      } else if (typeof body.to === 'string') {
        const instant = new Date(body.to);
        if (Number.isNaN(instant.getTime())) {
          throw new MimMockError('VALIDATION_FAILED', {
            errors: [{ field: 'to', reason: 'ISO-8601 tarih bekleniyor.' }],
          });
        }
        clock.setTo(instant);
      } else {
        const days = Number(body.advanceDays ?? 0);
        const ms = Number(body.advanceMs ?? 0);
        if (!Number.isFinite(days) || !Number.isFinite(ms) || (days === 0 && ms === 0)) {
          throw new MimMockError('VALIDATION_FAILED', {
            errors: [{ field: 'advanceMs', reason: '`advanceMs`, `advanceDays`, `to` ya da `reset` verin.' }],
          });
        }
        clock.advance(days * 24 * 60 * 60 * 1000 + ms);
      }

      // Saat ilerleyince vadesi gelenler HEMEN ateşlenir — testin beklemesi gerekmesin.
      const outcomes = await engine.tick();
      return {
        now: clock.now().toISOString(),
        offsetMs: clock.offsetMs(),
        appliedTransitions: outcomes,
      };
    },
  );

  /**
   * K7c — ham XML enjeksiyonu. *"otomatik test için ŞART"* (plan K7).
   *
   * Gelen belgeyi şirketler-arası teslim beklemeden doğurur; `X-Company`
   * gelen kutusunun sahibini seçer. Senaryo `X-Scenario` ile verilebilir —
   * `inbound_sr_stalled` ile teyidin HİÇ gelmediği hâl sınanır.
   */
  app.post('/v1/_sandbox/inbox', async (request, reply) => {
    const auth = await request.authenticate();
    const receiver = requireCompany(auth);

    const raw = request.body;
    const xml = typeof raw === 'string' ? raw : Buffer.isBuffer(raw) ? raw.toString('utf8') : null;
    if (xml === null) {
      throw new MimMockError('MALFORMED_XML', {
        reason: 'Gövde ham XML olmalı (content-type: application/xml).',
      });
    }
    const scenario =
      typeof request.headers['x-scenario'] === 'string' ? request.headers['x-scenario'] : undefined;

    const document = await createInboundDocument(
      { xml, receiver, tenantId: auth.tenant.id, scenario },
      { repo, engine, clock },
    );

    reply.code(202);
    return {
      id: document.id,
      ettn: document.ettn,
      // 🔑 İlk adım: RECEIVED. DELIVERED için S_APR teyidi gerekir.
      status: document.status,
      replyStatus: document.replyStatus,
      scenario: scenario ?? 'inbound_happy',
    };
  });

  /**
   * Trafik üretecini elle tetikle (plan §5b).
   * Beklemeden bir tur üretir; sonuç her belgenin mimkit doğrulama kararını taşır.
   */
  app.post('/v1/_sandbox/traffic', async (request) => {
    const auth = await request.authenticate();
    if (!deps.traffic) {
      throw new MimMockError('VALIDATOR_UNAVAILABLE', {
        reason:
          'Trafik üreteci kapalı: mimkit hazır değil. Üretilen trafik GERÇEK ' +
          'UBL olmalıdır (plan §5b); doğrulamasız üretim sahte gövde demektir.',
      });
    }
    const results = await deps.traffic.run(auth.tenant.id);
    return {
      produced: results.filter((r) => r.valid && !r.duplicate).length,
      duplicate: results.filter((r) => r.duplicate).length,
      rejected: results.filter((r) => !r.valid).length,
      results,
      stats: deps.traffic.stats(),
    };
  });

  /** Tohumu sıfırla — aynı akışı baştan üret. */
  app.post('/v1/_sandbox/traffic/reset', async (request) => {
    await request.authenticate();
    deps.traffic?.reset();
    return { reset: true, seed: config.trafficSeed };
  });

  /** Veriyi sıfırla — tohum yeniden yazılır. */
  app.post('/v1/_sandbox/reset', async (request) => {
    await request.authenticate();
    for (const statement of dropSchemaStatements(handle.dialect)) await handle.execRaw(statement);
    for (const statement of createSchemaStatements(handle.dialect)) await handle.execRaw(statement);
    clock.reset();
    const seeded = config.seed ? await seedIfEmpty(repo) : null;
    return {
      reset: true,
      seeded: seeded?.created ?? false,
      tenantApiKey: seeded?.tenantApiKey ?? null,
    };
  });

  /** Senaryoyu sonradan değiştir / yeniden zamanla. */
  app.post<{ Params: { id: string }; Body: { scenario?: unknown } }>(
    '/v1/_sandbox/documents/:id/scenario',
    async (request) => {
      const auth = await request.authenticate();
      const body = (request.body ?? {}) as Record<string, unknown>;
      const scenario = typeof body.scenario === 'string' ? body.scenario : '';
      if (!isScenarioName(scenario)) {
        throw new MimMockError('VALIDATION_FAILED', {
          errors: [
            { field: 'scenario', reason: `Bilinmeyen senaryo. Seçenekler: ${Object.keys(SCENARIOS).join(', ')}` },
          ],
        });
      }
      const document = await repo.findDocumentById(auth.tenant.id, request.params.id);
      if (!document) throw new MimMockError('DOCUMENT_NOT_FOUND');
      await engine.schedule(document.id, scenario);
      const after = await repo.findDocumentById(auth.tenant.id, request.params.id);
      return { scenario, nextState: after?.nextState ?? null, nextAt: after?.nextAt?.toISOString() ?? null };
    },
  );
}
