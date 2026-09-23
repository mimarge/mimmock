/**
 * `/v1/documents` — plan §4, K1 (JSON ana yol + UBL ucu).
 *
 * İki uç AYNI kaynağı döner: JSON yolu yalnız önüne bir dönüştürücü ekler
 * (json2ubl-ts, plan K1). İngest kapıları tek gövdededir (`ingest.ts`) — iki uç
 * için iki kapı listesi olsaydı sapma kaçınılmazdı.
 */
import type { FastifyInstance } from 'fastify';
import { SimpleInvoiceBuilder } from 'json2ubl-ts';
import { MimMockError, type FieldError } from '../errors.js';
import { requireCompany } from '../auth.js';
import { ingestDocument } from '../ingest.js';
import type { DocumentRow } from '../db/repo.js';
import { isScenarioName, SCENARIOS } from '../engine/scenarios.js';
import { resendClassOf } from '../engine/resend-class.js';
import type { AppDeps } from '../deps.js';

/** Dış temsil. `ublXml` büyük olduğu için listede taşınmaz, kendi ucundan alınır. */
export function serializeDocument(row: DocumentRow) {
  return {
    id: row.id,
    ettn: row.ettn,
    direction: row.direction,
    type: row.type,
    profile: row.profile,
    typeCode: row.typeCode,
    /** Bizim sözlüğümüz birincil (plan §5 sunum kuralı). */
    status: row.status,
    /** Ham GİB kodu yanında durur; M3'e kadar boş. */
    rawGibCode: row.rawGibCode,
    replyStatus: row.replyStatus,
    documentNumber: row.documentNumber,
    issueDate: row.issueDate,
    senderVkn: row.senderVkn,
    receiverVkn: row.receiverVkn,
    currencyCode: row.currencyCode,
    payableAmount: row.payableAmount,
    sourceKind: row.sourceKind,
    generated: row.generated,
    generatedScenario: row.generatedScenario,
    validation: { appliedXsd: row.appliedXsd, appliedSchematron: row.appliedSchematron },
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    signature: {
      kind: row.signatureKind,
      signedAt: row.signedAt?.toISOString() ?? null,
      /** 🔴 Her zaman false — gerçek mühür üretilmez (plan K9). */
      chainValid: false,
    },
    engine: {
      scenario: row.scenario,
      nextState: row.nextState,
      nextAt: row.nextAt?.toISOString() ?? null,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function parsePositiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
}

export function registerDocumentRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { repo, kittest, config, engine } = deps;

  /**
   * Senaryo seçimi (plan §5a): belge oluşturulurken `X-Scenario` başlığıyla ya da
   * JSON gövdesindeki `scenario` alanıyla. Verilmezse `happy`.
   */
  function scenarioFrom(header: unknown, body?: Record<string, unknown>): string | undefined {
    const raw =
      (typeof header === 'string' ? header : undefined) ??
      (typeof body?.scenario === 'string' ? body.scenario : undefined);
    if (raw === undefined) return undefined;
    if (!isScenarioName(raw)) {
      throw new MimMockError('VALIDATION_FAILED', {
        errors: [
          { field: 'scenario', reason: `Bilinmeyen senaryo. Seçenekler: ${Object.keys(SCENARIOS).join(', ')}` },
        ],
      });
    }
    return raw;
  }

  /** K4 kapısı bilerek açıkken belge ALMA uçları kapalıdır — sessiz kip yok. */
  function assertOnline(): void {
    if (config.allowOffline && !deps.kittestReady) throw new MimMockError('OFFLINE_MODE');
  }

  async function ingestContextFor(tenantId: string, company: Parameters<typeof requireCompany>[0]['company']) {
    if (!company) throw new MimMockError('BRANCH_REQUIRED');
    return {
      tenantId,
      company,
      repo,
      kittest,
      /**
       * Mock'ta "sicil" = bu kiracıda tanımlı VE e-Fatura mükellefi olan şirketler.
       * MimForge bunu `gib-user-list`ten sorar; mock'ta şirket tanımı o listedir
       * (plan K7: tanımlı A → tanımlı B tam döngüsü buradan kuruluyor).
       */
      async resolveReceiverRegistered(vkn: string): Promise<boolean> {
        const receiver = await repo.findCompany(tenantId, vkn);
        return receiver?.eInvoiceRegistered === true;
      },
    };
  }

  /* ── JSON ana yolu (K1) ───────────────────────────────────────────────── */
  app.post('/v1/documents', async (request, reply) => {
    assertOnline();
    const auth = await request.authenticate();
    const company = requireCompany(auth);

    if (typeof request.body !== 'object' || request.body === null || Array.isArray(request.body)) {
      throw new MimMockError('VALIDATION_FAILED', { reason: 'Gövde bir JSON nesnesi olmalı.' });
    }
    const body = request.body as Record<string, unknown>;

    // json2ubl-ts JSON → UBL. Kütüphanenin kendi doğrulaması ayrı bir kapıdır:
    // buradan geçmeyen belge CANLI şematrona hiç gitmez.
    let xml: string;
    try {
      const builder = new SimpleInvoiceBuilder();
      xml = builder.build(body as never).xml;
    } catch (error) {
      const errors = extractBuildErrors(error);
      throw new MimMockError('JSON_BUILD_FAILED', {
        reason: error instanceof Error ? error.message : 'UBL üretilemedi.',
        ...(errors.length > 0 ? { errors } : {}),
      });
    }

    const seriesPrefix = typeof body.seriesPrefix === 'string' ? body.seriesPrefix : undefined;
    const scenario = scenarioFrom(request.headers['x-scenario'], body);
    const result = await ingestDocument(
      { xml, sourceKind: 'json', sourceJson: body, seriesPrefix },
      await ingestContextFor(auth.tenant.id, company),
    );
    // Motor belgeyi senaryoya bağlar; durum DB'de ilerler (plan §5a-1).
    await engine.schedule(result.document.id, scenario);

    // Başarı: 202 + { ettn } — ÖLÇÜLDÜ (`routes.documents.ts:1921`).
    reply.code(202);
    return {
      ettn: result.ettn,
      id: result.document.id,
      status: result.document.status,
      scenario: scenario ?? 'happy',
    };
  });

  /* ── Ham UBL ucu (K1) ─────────────────────────────────────────────────── */
  app.post('/v1/documents/ubl', async (request, reply) => {
    assertOnline();
    const auth = await request.authenticate();
    const company = requireCompany(auth);

    const raw = request.body;
    const xml = typeof raw === 'string' ? raw : Buffer.isBuffer(raw) ? raw.toString('utf8') : null;
    if (xml === null) {
      throw new MimMockError('MALFORMED_XML', {
        reason: 'Gövde ham XML olmalı (content-type: application/xml).',
      });
    }

    const seriesPrefix = typeof request.headers['x-series-prefix'] === 'string'
      ? request.headers['x-series-prefix']
      : undefined;

    const scenario = scenarioFrom(request.headers['x-scenario']);
    const result = await ingestDocument(
      { xml, sourceKind: 'ubl', seriesPrefix },
      await ingestContextFor(auth.tenant.id, company),
    );
    await engine.schedule(result.document.id, scenario);

    reply.code(202);
    return {
      ettn: result.ettn,
      id: result.document.id,
      status: result.document.status,
      scenario: scenario ?? 'happy',
    };
  });

  /* ── Okuma uçları ─────────────────────────────────────────────────────── */
  app.get<{ Querystring: Record<string, string> }>('/v1/documents', async (request) => {
    const auth = await request.authenticate();
    const query = request.query;
    const filter = {
      direction: query.direction,
      status: query.status,
      type: query.type,
      // X-Company verilmişse liste o mükellefle sınırlanır.
      companyId: auth.company?.id,
      limit: parsePositiveInt(query.limit, 50, 200),
      offset: parsePositiveInt(query.offset, 0, Number.MAX_SAFE_INTEGER),
    };
    const [documents, total] = await Promise.all([
      repo.listDocuments(auth.tenant.id, filter),
      repo.countDocuments(auth.tenant.id, filter),
    ]);
    return {
      documents: documents.map(serializeDocument),
      page: { total, limit: filter.limit, offset: filter.offset },
    };
  });

  app.get<{ Params: { id: string } }>('/v1/documents/:id', async (request) => {
    const auth = await request.authenticate();
    const row = await repo.findDocumentById(auth.tenant.id, request.params.id);
    if (!row) throw new MimMockError('DOCUMENT_NOT_FOUND');
    return serializeDocument(row);
  });

  /**
   * `POST /v1/documents/:id/resend` — sözlük §4.3.
   *
   * 🔑 Bu ucun asıl öğrettiği şey: **`SEND_FAILED` terminal DEĞİLDİR**, ama her
   * hatadan aynı şekilde çıkılmaz. Resend sınıfı (A/B/C) son ham GİB koduna
   * bakar; B sınıfında zarfı aynen tekrar göndermek aynı reddi üretir.
   */
  app.post<{ Params: { id: string } }>('/v1/documents/:id/resend', async (request) => {
    const auth = await request.authenticate();
    const document = await repo.findDocumentById(auth.tenant.id, request.params.id);
    if (!document) throw new MimMockError('DOCUMENT_NOT_FOUND');

    // Sıra sözlük §4.3'ten: durum kapıları önce, GİB-kodu kapıları sonra.
    if (document.status === 'DELIVERED') throw new MimMockError('ALREADY_DELIVERED');
    if (document.status === 'PROCESSING' || document.status === 'SENT_TO_GIB') {
      throw new MimMockError('SEND_IN_PROGRESS');
    }
    if (document.status !== 'SEND_FAILED') throw new MimMockError('NOT_RESENDABLE');
    if (document.direction !== 'OUTBOUND') throw new MimMockError('NOT_RESENDABLE');

    const resendClass = resendClassOf(document.rawGibCode);
    if (resendClass === 'B') {
      throw new MimMockError('NEEDS_RESIGN', {
        reason:
          `Son GİB kodu ${document.rawGibCode} B sınıfı: hata belgede/imzada. ` +
          'Zarfı aynen tekrar göndermek aynı reddi üretir; belgeyi düzeltip aynı ETTN ile yeniden POST edin.',
      });
    }
    if (resendClass === 'C') {
      throw new MimMockError('NOT_RESENDABLE_GIB', {
        reason: `Son GİB kodu ${document.rawGibCode} C sınıfı (asla/bekle).`,
      });
    }
    // `null` = tabloda yok → A gibi davran (bilinçli fail-open, ölçüldü).

    const outcome = await engine.resend(auth.tenant.id, document.id);
    if (!outcome) throw new MimMockError('NOT_RESENDABLE', { reason: 'Eşzamanlı değişim.' });

    const after = await repo.findDocumentById(auth.tenant.id, document.id);
    return {
      id: document.id,
      ettn: document.ettn,
      status: after?.status ?? 'PROCESSING',
      resendClass: resendClass ?? 'A (tabloda yok — fail-open)',
      applied: outcome,
    };
  });

  app.get<{ Params: { id: string } }>('/v1/documents/:id/xml', async (request, reply) => {
    const auth = await request.authenticate();
    const row = await repo.findDocumentById(auth.tenant.id, request.params.id);
    if (!row) throw new MimMockError('DOCUMENT_NOT_FOUND');
    reply.header('content-type', 'application/xml; charset=utf-8');
    /*
     * 🔴 İmza TEST sertifikasıyladır: yapı gerçek, güven zinciri KASTEN geçersiz
     * (plan §1/K9). Zincir doğrulaması yazan geliştirici bunu görünce "mock bozuk"
     * sanmasın diye başlıkta yüksek sesle söylüyoruz.
     */
    /*
     * ⚠️ Başlık adı `X-MimMock-Document-Signature`: plan §7 `X-MimMock-Signature`'ı
     * WEBHOOK imzasına ayırmıştır. İkisini aynı ada koymak, webhook doğrulaması
     * yazan geliştiricinin yanlış başlığı aramasına yol açardı.
     */
    reply.header(
      'X-MimMock-Document-Signature',
      row.signatureKind === 'test-certificate'
        ? 'test-certificate; self-signed; chain-validation-fails-by-design'
        : 'none',
    );
    return row.ublXml;
  });
}

/** json2ubl-ts `UblBuildError` içindeki alan hatalarını dışa çevirir. */
function extractBuildErrors(error: unknown): FieldError[] {
  if (!error || typeof error !== 'object') return [];
  const candidate = (error as { errors?: unknown }).errors;
  if (!Array.isArray(candidate)) return [];
  return candidate.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const e = entry as Record<string, unknown>;
    return [
      {
        field: typeof e.path === 'string' ? e.path : typeof e.field === 'string' ? e.field : 'input',
        reason: typeof e.message === 'string' ? e.message : String(entry),
      },
    ];
  });
}
