/**
 * Gözlemlenebilirlik — plan §8'in iki maddesi.
 *
 * 1. **İstek günlüğü**: *"geliştirici ne gönderdi, biz ne döndük (ham)"*.
 * 2. **Belge olay geçmişi**: bir belgenin o duruma NASIL geldiği.
 *
 * Panelin üç sorusuna karşılık gelirler:
 *   - *ne oldu?*          → istek günlüğü + olay geçmişi
 *   - *neden oldu?*       → olayın kural kimliği ve ham GİB kodu
 *   - *şimdi ne olacak?*  → belgenin `nextState`/`nextAt` alanları (motor)
 */
import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { DbHandle } from './db/client.js';
import type { Clock } from './engine/clock.js';
import type { TransitionOutcome } from './engine/engine.js';

/**
 * ⚠️ Maskelenen başlıklar. Yerel sandbox olsa da ham günlüğe anahtar yazmak,
 * geliştiricinin ekran görüntüsü paylaştığı anda sızıntıya dönüşür.
 */
const MASKED_HEADERS = new Set(['authorization', 'x-panel-token', 'x-mimmock-signature']);
/** Gövde kırpma sınırı — UBL belgeleri megabaytlarca olabilir. */
const BODY_LIMIT = 4000;

function maskHeaders(headers: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value !== 'string') continue;
    out[key] = MASKED_HEADERS.has(key.toLowerCase())
      ? `${value.slice(0, 6)}…(maskelendi)`
      : value;
  }
  return out;
}

function clip(body: unknown): string | null {
  if (body === undefined || body === null) return null;
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  if (text.length <= BODY_LIMIT) return text;
  return `${text.slice(0, BODY_LIMIT)}\n… (${text.length - BODY_LIMIT} karakter kırpıldı)`;
}

export interface ObservabilityDeps {
  handle: DbHandle;
  clock: Clock;
  /** Günlükte tutulacak en fazla kayıt; eskiler silinir. */
  limit: number;
}

/** İstek/yanıt günlüğünü Fastify'a takar. */
export function registerRequestLog(app: FastifyInstance, deps: ObservabilityDeps): void {
  const { handle, clock } = deps;

  app.addHook('onRequest', async (request) => {
    (request as { startedAt?: number }).startedAt = Date.now();
  });

  app.addHook('onSend', async (request, reply, payload) => {
    // Panel varlıkları ve günlüğün kendisi günlüğe girmez: gürültü, sinyali boğar.
    if (!request.url.startsWith('/v1/')) return payload;
    if (request.url.startsWith('/v1/_sandbox/requests')) return payload;

    const startedAt = (request as { startedAt?: number }).startedAt ?? Date.now();
    const body = typeof payload === 'string' ? payload : null;
    let errorCode: string | null = null;
    if (body && reply.statusCode >= 400) {
      try {
        errorCode = (JSON.parse(body) as { errorCode?: string }).errorCode ?? null;
      } catch {
        errorCode = null;
      }
    }

    try {
      await handle.db.insert(handle.tables.request_log).values({
        id: `req_${randomUUID()}`,
        tenantId: (request as { loggedTenantId?: string }).loggedTenantId ?? null,
        at: clock.now(),
        method: request.method,
        url: request.url,
        status: reply.statusCode,
        durationMs: Date.now() - startedAt,
        errorCode,
        requestHeaders: maskHeaders(request.headers as Record<string, unknown>),
        requestBody: clip(request.body),
        responseBody: clip(body),
        companyVkn:
          typeof request.headers['x-company'] === 'string' ? request.headers['x-company'] : null,
      });
    } catch {
      // Günlük yazımı isteği ASLA düşürmemeli.
    }
    return payload;
  });
}

/** Motor geçişlerini olay geçmişine yazar. */
export async function recordTransition(
  deps: ObservabilityDeps,
  outcome: TransitionOutcome,
): Promise<void> {
  await deps.handle.db.insert(deps.handle.tables.document_events).values({
    id: `evt_${randomUUID()}`,
    tenantId: outcome.tenantId,
    documentId: outcome.documentId,
    at: outcome.at,
    ruleId: outcome.ruleId,
    axis: outcome.axis ?? 'status',
    fromValue: outcome.from,
    toValue: outcome.to,
    rawGibCode: outcome.rawGibCode,
    alarm: outcome.alarm,
    documentVersion: outcome.documentVersion,
  });
}

export function registerObservabilityRoutes(
  app: FastifyInstance,
  deps: ObservabilityDeps,
): void {
  const { handle } = deps;
  const { db, tables } = handle;

  /** Ham istek günlüğü — plan §8'in "🔑" ile işaretlediği madde. */
  app.get<{ Querystring: Record<string, string> }>('/v1/_sandbox/requests', async (request) => {
    const auth = await request.authenticate();
    const conditions = [eq(tables.request_log.tenantId, auth.tenant.id)];
    if (request.query.errorsOnly === '1') {
      // Hata ayıklamada en çok istenen süzgeç.
      conditions.push(eq(tables.request_log.status, Number(request.query.status ?? 400)));
    }
    const rows = await db
      .select()
      .from(tables.request_log)
      .where(and(...conditions))
      .orderBy(desc(tables.request_log.at))
      .limit(Math.min(Number(request.query.limit ?? 50), 200));

    return {
      requests: rows.map((row) => ({
        id: row.id,
        at: row.at.toISOString(),
        method: row.method,
        url: row.url,
        status: row.status,
        durationMs: row.durationMs,
        errorCode: row.errorCode,
        companyVkn: row.companyVkn,
        requestHeaders: row.requestHeaders,
        requestBody: row.requestBody,
        responseBody: row.responseBody,
      })),
    };
  });

  /** Belgenin olay geçmişi — "neden bu duruma geldi". */
  app.get<{ Params: { id: string } }>('/v1/documents/:id/history', async (request) => {
    const auth = await request.authenticate();
    const rows = await db
      .select()
      .from(tables.document_events)
      .where(
        and(
          eq(tables.document_events.tenantId, auth.tenant.id),
          eq(tables.document_events.documentId, request.params.id),
        ),
      )
      .orderBy(tables.document_events.at);

    return {
      events: rows.map((row) => ({
        at: row.at.toISOString(),
        /** Sözlükteki geçiş satırı — izlenebilirliğin çıpası. */
        ruleId: row.ruleId,
        axis: row.axis,
        from: row.fromValue,
        to: row.toValue,
        rawGibCode: row.rawGibCode,
        alarm: row.alarm,
        documentVersion: row.documentVersion,
      })),
    };
  });
}
