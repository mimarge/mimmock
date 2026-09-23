/**
 * `/v1/webhooks` — plan §4 ve §7.
 *
 * Ayrıca 🔑 **tohum webhook alıcısı** (`/v1/_sandbox/webhook-sink`, plan K13):
 * mock kendi webhook'unu kendi yutar. Geliştirici kendi sunucusunu kurmadan
 * teslimi, imzayı ve yeniden denemeyi GÖREBİLİR — boş bir teslim günlüğü
 * "şimdi ne yapacağım" demektir.
 */
import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { MimMockError } from '../errors.js';
import {
  WEBHOOK_EVENTS,
  isWebhookEvent,
  RETRY_DELAYS_MS,
  MAX_ATTEMPTS,
} from '../webhooks/dispatcher.js';
import {
  verifySignature,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  EVENT_HEADER,
  SEQUENCE_HEADER,
} from '../webhooks/signature.js';
import type { WebhookDeliveryRow, WebhookRow } from '../db/repo.js';
import type { AppDeps } from '../deps.js';

/**
 * Tohum alıcının anahtarı — TEK KAYNAK `seed.ts`. İki yere yazılsaydı biri
 * değiştiğinde imza sessizce tutmaz ve hata "alıcı bozuk" gibi görünürdü.
 */
import { SEED_WEBHOOK_SECRET } from '../seed.js';
export const SINK_SECRET = SEED_WEBHOOK_SECRET;

function serializeWebhook(row: WebhookRow) {
  return {
    id: row.id,
    url: row.url,
    /** Yerel sandbox: anahtar görünür, yoksa imza doğrulaması denenemez. */
    secret: row.secret,
    events: row.events.length > 0 ? row.events : [...WEBHOOK_EVENTS],
    companyVkn: row.companyId,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeDelivery(row: WebhookDeliveryRow) {
  return {
    id: row.id,
    webhookId: row.webhookId,
    sequence: row.sequence,
    event: row.eventType,
    documentId: row.documentId,
    documentVersion: row.documentVersion,
    status: row.status,
    attempt: row.attempt,
    maxAttempts: MAX_ATTEMPTS,
    httpStatus: row.httpStatus,
    error: row.error,
    nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    payload: row.payload,
  };
}

export function registerWebhookRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { handle, dispatcher, clock } = deps;
  const { db, tables } = handle;

  app.post<{ Body: Record<string, unknown> }>('/v1/webhooks', async (request, reply) => {
    const auth = await request.authenticate();
    const body = (request.body ?? {}) as Record<string, unknown>;

    const url = typeof body.url === 'string' ? body.url.trim() : '';
    if (!/^https?:\/\/.+/i.test(url)) {
      throw new MimMockError('VALIDATION_FAILED', {
        errors: [{ field: 'url', reason: 'http(s) ile başlayan bir adres gerekli.' }],
      });
    }

    const events = Array.isArray(body.events) ? body.events.map(String) : [];
    const unknown = events.filter((e) => !isWebhookEvent(e));
    if (unknown.length > 0) {
      throw new MimMockError('VALIDATION_FAILED', {
        errors: [
          {
            field: 'events',
            reason: `Tanınmayan olay: ${unknown.join(', ')}. Seçenekler: ${WEBHOOK_EVENTS.join(', ')}`,
          },
        ],
      });
    }

    // Şirket süzgeci VKN ile verilir; kimliğe burada çevrilir.
    let companyId: string | null = null;
    if (typeof body.companyVkn === 'string' && body.companyVkn !== '') {
      const company = await deps.repo.findCompany(auth.tenant.id, body.companyVkn);
      if (!company) throw new MimMockError('CONTEXT');
      companyId = company.id;
    }

    const [created] = await db
      .insert(tables.webhooks)
      .values({
        id: `wh_${randomUUID()}`,
        tenantId: auth.tenant.id,
        companyId,
        url,
        secret: typeof body.secret === 'string' && body.secret ? body.secret : `whsec_${randomUUID()}`,
        events,
        active: body.active !== false,
      })
      .returning();

    reply.code(201);
    return serializeWebhook(created!);
  });

  app.get('/v1/webhooks', async (request) => {
    const auth = await request.authenticate();
    const rows = await db
      .select()
      .from(tables.webhooks)
      .where(eq(tables.webhooks.tenantId, auth.tenant.id));
    return {
      webhooks: rows.map(serializeWebhook),
      /** Geri çekilme şeması görünür olsun — geliştirici ne bekleyeceğini bilsin. */
      retryPolicy: { delaysMs: [...RETRY_DELAYS_MS], maxAttempts: MAX_ATTEMPTS },
    };
  });

  app.get<{ Params: { id: string }; Querystring: Record<string, string> }>(
    '/v1/webhooks/:id/deliveries',
    async (request) => {
      const auth = await request.authenticate();
      const rows = await db
        .select()
        .from(tables.webhook_deliveries)
        .where(
          and(
            eq(tables.webhook_deliveries.tenantId, auth.tenant.id),
            eq(tables.webhook_deliveries.webhookId, request.params.id),
          ),
        )
        .orderBy(desc(tables.webhook_deliveries.sequence))
        .limit(100);
      return { deliveries: rows.map(serializeDelivery) };
    },
  );

  /** Elle yeniden gönderme — ölü mektuptan da çalışır (plan §7). */
  app.post<{ Params: { id: string }; Body: { deliveryId?: unknown } }>(
    '/v1/webhooks/:id/replay',
    async (request) => {
      const auth = await request.authenticate();
      const body = (request.body ?? {}) as Record<string, unknown>;
      const deliveryId = typeof body.deliveryId === 'string' ? body.deliveryId : '';
      if (!deliveryId) {
        throw new MimMockError('VALIDATION_FAILED', {
          errors: [{ field: 'deliveryId', reason: 'Yeniden gönderilecek teslim kimliği gerekli.' }],
        });
      }
      const result = await dispatcher.replay(auth.tenant.id, deliveryId);
      if (!result) throw new MimMockError('NOT_FOUND', { reason: 'Teslim kaydı bulunamadı.' });
      return serializeDelivery(result);
    },
  );

  /* ── Tohum alıcı (plan K13) ─────────────────────────────────────────────── */

  /**
   * Mock'un kendi webhook alıcısı. İmzayı GERÇEKTEN doğrular ve sonucu saklar —
   * yani buradaki kayıt aynı zamanda imza sözleşmesinin canlı kanıtıdır.
   * Kimlik istemez: yalnız mock'un kendisi çağırır ve yerel sandbox'tadır.
   */
  app.post('/v1/_sandbox/webhook-sink', async (request, reply) => {
    const raw = typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {});
    const verdict = verifySignature({
      secret: SINK_SECRET,
      signature: request.headers[SIGNATURE_HEADER] as string | undefined,
      timestamp: request.headers[TIMESTAMP_HEADER] as string | undefined,
      body: raw,
      // Doğrulama da GERÇEK zamanla: imza damgası gerçek zamanda atılıyor.
      now: new Date(),
    });

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { raw };
    }

    await db.insert(tables.webhook_sink_events).values({
      id: `sink_${randomUUID()}`,
      receivedAt: clock.now(),
      eventType: (request.headers[EVENT_HEADER] as string | undefined) ?? 'unknown',
      sequence: Number(request.headers[SEQUENCE_HEADER] ?? 0) || null,
      signatureValid: verdict.valid,
      signatureError: verdict.valid ? null : `${verdict.reason}: ${verdict.detail}`,
      body: parsed,
    });

    // 🔴 Geçersiz imzayı 202 ile yutmak, bozuk bir imzalayıcıyı görünmez kılardı.
    if (!verdict.valid) {
      reply.code(400);
      return { accepted: false, signature: verdict };
    }
    return { accepted: true };
  });

  app.get('/v1/_sandbox/webhook-sink', async (request) => {
    await request.authenticate();
    const rows = await db
      .select()
      .from(tables.webhook_sink_events)
      .orderBy(desc(tables.webhook_sink_events.receivedAt))
      .limit(50);
    return {
      events: rows.map((row) => ({
        id: row.id,
        receivedAt: row.receivedAt.toISOString(),
        event: row.eventType,
        sequence: row.sequence,
        signatureValid: row.signatureValid,
        signatureError: row.signatureError,
        body: row.body,
      })),
    };
  });
}
