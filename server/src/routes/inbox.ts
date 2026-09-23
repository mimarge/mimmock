/**
 * `/v1/inbox` — gelen kutusu ve ticari yanıt (plan §4, M5).
 *
 * 🔑 Bu dosyanın öğrettiği tek şey `DOCUMENT_NOT_SETTLED` kapısıdır. Gelen belge
 * iki adımlıdır; teyit gelmeden yanıt verilemez. Tek adımlı bir gelen kutusu
 * geliştiriciye bu kapıyı hiç göstermez ve üretimde ilk kez orada çarpar.
 */
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { MimMockError } from '../errors.js';
import { COMMERCIAL_PROFILE } from '../engine/inbound-transitions.js';
import { REPLY_SCENARIO } from '../engine/scenarios.js';
import type { DocumentRow } from '../db/repo.js';
import type { AppDeps } from '../deps.js';

function serializeInbox(row: DocumentRow) {
  return {
    id: row.id,
    ettn: row.ettn,
    type: row.type,
    profile: row.profile,
    typeCode: row.typeCode,
    /** 🔑 `RECEIVED` = zarf alındı · `DELIVERED` = S_APR teyitlendi. */
    status: row.status,
    rawGibCode: row.rawGibCode,
    replyStatus: row.replyStatus,
    replyDecision: row.replyDecision,
    replyReason: row.replyReason,
    documentNumber: row.documentNumber,
    issueDate: row.issueDate,
    senderVkn: row.senderVkn,
    receiverVkn: row.receiverVkn,
    payableAmount: row.payableAmount,
    currencyCode: row.currencyCode,
    /** Sistem yanıtı izleme — ikinci adımın görünür yüzü. */
    systemResponse: {
      sentAt: row.srSentAt?.toISOString() ?? null,
      confirmedAt: row.srConfirmedAt?.toISOString() ?? null,
      code: row.srCode,
    },
    /** Yanıt verilebilir mi ve verilemiyorsa NEDEN. */
    replyable: replyability(row),
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    replyDeadlineAt: row.replyDeadlineAt?.toISOString() ?? null,
    sourceDocumentId: row.sourceDocumentId,
    /** 🔑 Üretilmiş trafik AÇIKÇA işaretli (plan §5b). */
    generated: row.generated,
    generatedScenario: row.generatedScenario,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Kapıyı yanıt vermeden ÖNCE görünür kılar — panel de bunu gösterir. */
function replyability(row: DocumentRow): { can: boolean; reason: string | null } {
  if (row.direction !== 'INBOUND') return { can: false, reason: 'NOT_COMMERCIAL' };
  if (row.profile !== COMMERCIAL_PROFILE) return { can: false, reason: 'NOT_COMMERCIAL' };
  if (row.status !== 'DELIVERED') return { can: false, reason: 'DOCUMENT_NOT_SETTLED' };
  if (row.replyStatus === 'REPLY_IN_PROGRESS') return { can: false, reason: 'REPLY_IN_PROGRESS' };
  if (row.replyStatus !== 'AWAITING') return { can: false, reason: 'ALREADY_REPLIED' };
  return { can: true, reason: null };
}

export function registerInboxRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { handle, repo, engine, clock } = deps;
  const { db, tables } = handle;

  app.get<{ Querystring: Record<string, string> }>('/v1/inbox', async (request) => {
    const auth = await request.authenticate();
    const conditions = [
      eq(tables.documents.tenantId, auth.tenant.id),
      eq(tables.documents.direction, 'INBOUND'),
    ];
    if (auth.company) conditions.push(eq(tables.documents.companyId, auth.company.id));
    if (request.query.status) conditions.push(eq(tables.documents.status, request.query.status));
    if (request.query.replyStatus) {
      conditions.push(eq(tables.documents.replyStatus, request.query.replyStatus));
    }

    const rows = await db
      .select()
      .from(tables.documents)
      .where(and(...conditions))
      .orderBy(desc(tables.documents.createdAt))
      .limit(100);
    return { inbox: rows.map(serializeInbox) };
  });

  app.get<{ Params: { id: string } }>('/v1/inbox/:id', async (request) => {
    const auth = await request.authenticate();
    const row = await repo.findDocumentById(auth.tenant.id, request.params.id);
    if (!row || row.direction !== 'INBOUND') throw new MimMockError('DOCUMENT_NOT_FOUND');
    return serializeInbox(row);
  });

  /**
   * Ticari kabul / ret — sözlük §3.3 Y1 ve §4.4.
   * Kapı SIRASI normatiftir: tip → uçtan uca tamamlanma → yanıt durumu → süre.
   */
  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>(
    '/v1/inbox/:id/reply',
    async (request) => {
      const auth = await request.authenticate();
      const body = (request.body ?? {}) as Record<string, unknown>;
      const document = await repo.findDocumentById(auth.tenant.id, request.params.id);
      if (!document || document.direction !== 'INBOUND') {
        throw new MimMockError('DOCUMENT_NOT_FOUND');
      }

      const decisionRaw = typeof body.decision === 'string' ? body.decision.toUpperCase() : '';
      if (decisionRaw !== 'ACCEPTED' && decisionRaw !== 'REJECTED') {
        throw new MimMockError('VALIDATION_FAILED', {
          errors: [{ field: 'decision', reason: '`ACCEPTED` ya da `REJECTED` olmalı.' }],
        });
      }
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (decisionRaw === 'REJECTED' && reason === '') {
        throw new MimMockError('EMPTY_REJECT_REASON');
      }

      /* Kapı 1: yalnız GELEN TICARIFATURA yanıtlanabilir. */
      if (document.profile !== COMMERCIAL_PROFILE) throw new MimMockError('NOT_COMMERCIAL');

      /* 🔑 Kapı 2: belge uçtan uca tamamlanmadıysa yanıt YOK. M5'in ölçüsü budur. */
      if (document.status !== 'DELIVERED') throw new MimMockError('DOCUMENT_NOT_SETTLED');

      /* Kapı 3: yanıt durumu. */
      if (document.replyStatus === 'REPLY_IN_PROGRESS') throw new MimMockError('REPLY_IN_PROGRESS');
      if (document.replyStatus !== 'AWAITING') throw new MimMockError('ALREADY_REPLIED');

      /* Kapı 4: 8 günlük pencere (TTK md.21). */
      if (document.replyDeadlineAt && clock.now() > document.replyDeadlineAt) {
        throw new MimMockError('REPLY_WINDOW_EXPIRED');
      }

      // Y1: CAS `AWAITING` → `REPLY_IN_PROGRESS`; karar burada saklanır.
      const opened = await db
        .update(tables.documents)
        .set({
          replyStatus: 'REPLY_IN_PROGRESS',
          replyDecision: decisionRaw,
          replyReason: reason || null,
          updatedAt: clock.now(),
          version: document.version + 1,
        })
        .where(
          and(
            eq(tables.documents.id, document.id),
            eq(tables.documents.replyStatus, 'AWAITING'),
          ),
        )
        .returning();
      if (opened.length === 0) throw new MimMockError('REPLY_IN_PROGRESS');

      // Yanıt zarfı akışı: 1300 ile kapanacak (Y2/Y3).
      await engine.schedule(document.id, REPLY_SCENARIO);

      const after = await repo.findDocumentById(auth.tenant.id, document.id);
      return serializeInbox(after!);
    },
  );
}

export { serializeInbox };
