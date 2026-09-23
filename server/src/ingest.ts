/**
 * Belge alma (ingest) — kapı sırası sözlük §4.2'den ÖLÇÜLDÜ ve NORMATİFTİR.
 *
 * MimForge kapıları şu sırayla uygular; mock da aynı sırayı korur. Sıra önemlidir:
 * geliştirici bozuk bir belge gönderdiğinde hangi hatayı ÖNCE göreceği, entegrasyonu
 * düzeltme sırasını belirler. Sıra kayarsa mock yanlış şey öğretir.
 *
 * Başarı: **202 + { ettn }** — ölçüldü (`routes.documents.ts:1921`). `201` değil;
 * gerekçe `docs/acik-kalanlar.md` §16.
 */
import { randomUUID } from 'node:crypto';
import { MimMockError, type FieldError } from './errors.js';
import {
  parseUbl,
  documentTypeFromUbl,
  embedDocumentNumber,
  UblParseError,
  type ParsedUbl,
} from './ubl/parse.js';
import {
  SCHEMATRON_TYPE_BY_DOC_TYPE,
  UNSIGNED_PROFILE_BY_UBL_ROOT,
  UNNUMBERED_PROFILE_BY_UBL_ROOT,
  V1_DOCUMENT_TYPES,
  assertWritableStatus,
  type DocumentType,
} from './status.js';
import {
  ValidatorUnavailableError,
  ValidatorBadRequestError,
  NumberingUnavailableError,
  NumberingRejectedError,
  type Kittest,
} from './kittest/index.js';
import type { Repo, CompanyRow, DocumentRow } from './db/repo.js';

/** Belge-no biçimi — ÖLÇÜLDÜ: `routes.documents.ts:172` (`DOCNO_FORMAT_RE`). */
export const DOCNO_FORMAT_RE = /^[A-Z0-9]{3}20\d{2}\d{9}$/;

export interface IngestInput {
  /** Ham UBL. JSON yolunda json2ubl-ts'in ürettiği çıktı buraya gelir. */
  xml: string;
  /** `json` veya `ubl` — belgenin hangi uçtan girdiği. */
  sourceKind: 'json' | 'ubl';
  /** JSON yolunda özgün gövde (panelin "ne gönderdi" sorusu için saklanır). */
  sourceJson?: unknown;
  /** Numarasız belgede kullanılacak seri öneki (K6). */
  seriesPrefix?: string | undefined;
}

export interface IngestContext {
  tenantId: string;
  company: CompanyRow;
  repo: Repo;
  kittest: Kittest;
  /** Alıcının "sicilde" olup olmadığını mock'ta tanımlı şirketlerden çözer. */
  resolveReceiverRegistered(vkn: string): Promise<boolean>;
}

export interface IngestResult {
  ettn: string;
  document: DocumentRow;
}

/** ETTN biçimi — UBL `cbc:UUID` bir UUID'dir. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function ingestDocument(
  input: IngestInput,
  context: IngestContext,
): Promise<IngestResult> {
  const { company, repo, kittest } = context;

  /* ── Kapı 1: MALFORMED_XML ───────────────────────────────────────────────
     Payload `<` ile başlamıyor / UBL kökü yok / parse hatası / bozuk ETTN. */
  let parsed: ParsedUbl;
  try {
    parsed = parseUbl(input.xml);
  } catch (error) {
    if (error instanceof UblParseError) {
      throw new MimMockError('MALFORMED_XML', { reason: error.message });
    }
    throw error;
  }
  if (parsed.ettn !== null && !UUID_RE.test(parsed.ettn)) {
    throw new MimMockError('MALFORMED_XML', { reason: `ETTN bir UUID değil: ${parsed.ettn}` });
  }
  if (parsed.documentNumber !== null && parsed.documentNumber.trim() === '') {
    throw new MimMockError('MALFORMED_XML', { reason: 'Belge numarası boş.' });
  }

  /* ── Kapı 2: TYPE_UNMAPPED — tip türetilemedi ───────────────────────────── */
  const docType = documentTypeFromUbl(parsed.root, parsed.profileId, parsed.typeCode);
  if (docType === null) {
    throw new MimMockError('TYPE_UNMAPPED', {
      reason: `UBL kökü "${parsed.root}" ve ProfileID "${parsed.profileId ?? '—'}" değerinden tip türetilemedi.`,
    });
  }

  /* ── Kapı 3: UNSUPPORTED_TYPE — v1 kapsamı e-Fatura + e-Arşiv (plan K2) ─── */
  if (!V1_DOCUMENT_TYPES.includes(docType)) {
    throw new MimMockError('UNSUPPORTED_TYPE', {
      reason: `${docType} bu fazda desteklenmiyor (v1: ${V1_DOCUMENT_TYPES.join(', ')}).`,
    });
  }

  /* ── Kapı 4: SERIES_PREFIX_NOT_APPLICABLE ────────────────────────────────
     Numarasız dalda (belge-no yok) format/yıl kapıları ATLANIR — ölçüldü
     (`routes.documents.ts:442`): numara henüz yok, mimkit sonra gömer. */
  const unnumbered = parsed.documentNumber === null;
  if (!unnumbered && input.seriesPrefix) {
    throw new MimMockError('SERIES_PREFIX_NOT_APPLICABLE');
  }

  if (!unnumbered) {
    const documentNumber = parsed.documentNumber as string;

    /* ── Kapı 5: DOCNO_FORMAT ───────────────────────────────────────────── */
    if (!DOCNO_FORMAT_RE.test(documentNumber)) {
      throw new MimMockError('DOCNO_FORMAT', {
        reason: `Belge-no formatı geçersiz (3 alfanümerik önek + yıl + 9 hane bekleniyor): ${documentNumber}`,
      });
    }

    /* ── Kapı 6: DOCNO_YEAR_MISMATCH ────────────────────────────────────── */
    if (parsed.issueDate !== null && parsed.issueDate.slice(0, 4) !== documentNumber.slice(3, 7)) {
      throw new MimMockError('DOCNO_YEAR_MISMATCH', {
        reason:
          `Belge-no seri yılı (${documentNumber.slice(3, 7)}) ` +
          `belge tarihi yılı (${parsed.issueDate.slice(0, 4)}) ile uyumsuz.`,
      });
    }
  }

  /* ── Kapı 7: MULTIPLE_TAX_TOTALS ─────────────────────────────────────────
     Kök seviyesi sayılır; kalem içi TaxTotal meşrudur (ölçüldü: :488 yorumu).
     ⚠️ Canlı kanıt: şematron çoklu kök-TaxTotal'ı REDDETMİYOR → kapı burada gerekli. */
  if (parsed.rootTaxTotalCount > 1) {
    throw new MimMockError('MULTIPLE_TAX_TOTALS', {
      reason: `Fatura kökünde ${parsed.rootTaxTotalCount} TaxTotal var, en fazla 1 olmalı.`,
    });
  }

  /* ── Kapı 8: SENDER_MISMATCH — belgedeki gönderici = X-Company olmalı ──── */
  if (parsed.senderVkn !== null && parsed.senderVkn !== company.vkn) {
    throw new MimMockError('SENDER_MISMATCH', {
      reason: `Belgedeki gönderici (${parsed.senderVkn}) X-Company (${company.vkn}) değil.`,
    });
  }

  /* ── Kapı 9: RECEIVER_VKN_MISSING — giden e-Faturada zorunlu ────────────── */
  if (docType === 'EFATURA' && parsed.receiverVkn === null) {
    throw new MimMockError('RECEIVER_VKN_MISSING');
  }

  /* ── Kapı 10/11: e-Fatura ↔ e-Arşiv ayrımı ───────────────────────────────
     🔑 MimForge sicili `gib-user-list`ten sorar; mock'ta "sicil" = tanımlı ve
     e-Fatura mükellefi olan şirketler kümesidir (plan K7/M5 ile tutarlı). */
  if (parsed.receiverVkn !== null) {
    const registered = await context.resolveReceiverRegistered(parsed.receiverVkn);
    if (docType === 'EFATURA' && !registered) {
      throw new MimMockError('RECEIVER_NOT_REGISTERED', {
        reason: `Alıcı ${parsed.receiverVkn} e-Fatura sicilinde yok — belge e-Arşiv olmalı.`,
      });
    }
    if (docType === 'EARSIV' && registered) {
      throw new MimMockError('RECEIVER_REGISTERED', {
        reason: `Alıcı ${parsed.receiverVkn} e-Fatura sicilinde var — belge e-Fatura olmalı.`,
      });
    }
  }

  /* ── Kapı 12: DUPLICATE_UUID (409) ──────────────────────────────────────── */
  const ettn = parsed.ettn ?? randomUUID();
  const existingByEttn = await repo.findDocumentByEttn(context.tenantId, ettn, 'OUTBOUND');
  if (existingByEttn) throw new MimMockError('DUPLICATE_UUID');

  /* ── Kapı 13: DUPLICATE_DOCNO (409) ─────────────────────────────────────── */
  if (!unnumbered) {
    const existingByNumber = await repo.findDocumentByNumber(
      context.tenantId,
      company.vkn,
      parsed.documentNumber as string,
    );
    if (existingByNumber) throw new MimMockError('DUPLICATE_DOCNO');
  }

  /* ── Kapı 14/15: CANLI doğrulama (K4) ───────────────────────────────────
     VALIDATOR_UNAVAILABLE (503, altyapı) ile SCHEMA_INVALID (400, belge) ayrımı
     ölçülmüştür: 5xx/408/429 altyapıdır, diğer 4xx belge hatasıdır. */
  const profile = unnumbered
    ? UNNUMBERED_PROFILE_BY_UBL_ROOT[parsed.root]
    : UNSIGNED_PROFILE_BY_UBL_ROOT[parsed.root];

  let validation;
  try {
    validation = await kittest.validator.validate(input.xml, {
      type: SCHEMATRON_TYPE_BY_DOC_TYPE[docType],
      profile,
    });
  } catch (error) {
    if (error instanceof ValidatorUnavailableError) {
      throw new MimMockError('VALIDATOR_UNAVAILABLE', { reason: error.message });
    }
    if (error instanceof ValidatorBadRequestError) {
      throw new MimMockError('MALFORMED_XML', { reason: error.message });
    }
    throw error;
  }

  if (!validation.validSchema || !validation.validSchematron) {
    const errors: FieldError[] = [
      ...validation.schemaErrors.map((message) => ({ field: 'xsd', reason: message })),
      ...validation.errors.map((e) => ({ field: e.ruleId || 'schematron', reason: e.message })),
    ];
    throw new MimMockError('SCHEMA_INVALID', { errors });
  }

  /* ── Kapı 16: numarasız belge → mimkit rezervasyonu (K6) ────────────────── */
  let documentNumber = parsed.documentNumber;
  let reservationId: string | null = null;
  /** Numarasız belgede gömme sonrası XML değişir; saklanan bu olmalı. */
  let finalXml = input.xml;
  if (unnumbered) {
    if (!kittest.numbers) {
      throw new MimMockError('NUMBERING_UNAVAILABLE', {
        reason:
          'Numarasız belge gönderildi ama numaratör yapılandırılmamış ' +
          '(MIMMOCK_MIMKIT_URL). Belgeyi kendi numaranızla gönderin ya da numaratörü bağlayın.',
      });
    }
    const seriesPrefix = input.seriesPrefix ?? company.seriesPrefix;
    if (!seriesPrefix) throw new MimMockError('NO_DEFAULT_SERIES');

    try {
      /*
       * 🔴 `reserve` ÖNEK değil seri KİMLİĞİ ister — canlı ölçüldü (2026-09-22):
       * önek gönderilince `404 NO_DEFAULT_SERIES` dönüyor. Önce önekten kimliğe
       * çözülür; seri yoksa açılır (MimForge'un K-N7 onarım deseni).
       */
      const seriesId = await kittest.numbers.resolveSeriesId({
        ownerTaxId: company.vkn,
        prefix: seriesPrefix,
        docType,
      });
      // 🔴 idempotency-key = ETTN. Yeniden denemede DEĞİŞMEZ (ölçüm §2).
      const reservation = await kittest.numbers.reserve({
        idempotencyKey: ettn,
        date: parsed.issueDate ?? new Date().toISOString().slice(0, 10),
        ownerTaxId: company.vkn,
        seriesId,
        docType,
      });
      documentNumber = reservation.number;
      reservationId = reservation.reservationId || null;
      // G4: numara UBL'e GÖMÜLÜR — yoksa saklanan belge ile verilen numara ayrışır.
      try {
        finalXml = embedDocumentNumber(finalXml, reservation.number);
      } catch (error) {
        // Numara ALINDI ama gömülemedi: sessizce devam etmek, kayıtla belgenin
        // ayrışması demektir. Açık hata daha dürüst.
        throw new MimMockError('MALFORMED_XML', {
          reason:
            `Numara (${reservation.number}) alındı ama belgeye gömülemedi: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        });
      }
    } catch (error) {
      if (error instanceof NumberingUnavailableError) {
        throw new MimMockError('NUMBERING_UNAVAILABLE', { reason: error.message });
      }
      if (error instanceof NumberingRejectedError) {
        throw new MimMockError('NUMBER_REJECTED', {
          reason: `${error.code ?? 'RED'}: ${error.message}`,
        });
      }
      throw error;
    }
  }

  /*
   * Giriş durumu — sözlük §3.1 G1/G2/G3'ten ÖLÇÜLDÜ:
   *   imzalı            → RECEIVED
   *   imzasız + numaralı → AWAITING_SIGNATURE
   *   imzasız + numarasız→ AWAITING_NUMBERING
   * Numarasız belge burada numarasını mimkit'ten aldığı için AWAITING_SIGNATURE'a
   * girer (G4: AWAITING_NUMBERING → AWAITING_SIGNATURE, numara gömüldükten sonra).
   */
  const status = assertWritableStatus(parsed.hasSignature ? 'RECEIVED' : 'AWAITING_SIGNATURE');

  const document = await repo.insertDocument({
    id: `doc_${randomUUID()}`,
    tenantId: context.tenantId,
    companyId: company.id,
    ettn,
    direction: 'OUTBOUND',
    type: docType,
    profile: parsed.profileId,
    typeCode: parsed.typeCode,
    status,
    rawGibCode: null,
    replyStatus: 'NONE',
    documentNumber,
    issueDate: parsed.issueDate ?? new Date().toISOString().slice(0, 10),
    senderVkn: parsed.senderVkn,
    receiverVkn: parsed.receiverVkn,
    currencyCode: parsed.currencyCode,
    payableAmount: parsed.payableAmount,
    ublXml: finalXml,
    sourceJson: input.sourceJson ?? null,
    sourceKind: input.sourceKind,
    appliedXsd: validation.appliedXsd ?? null,
    appliedSchematron: validation.appliedSchematron ?? null,
    numberReservationId: reservationId,
    /** Üreteç yazdıysa sonradan işaretlenir (plan §5b). */
    generated: false,
    generatedScenario: null,
    /** İlk sürüm; her durum geçişinde artar (plan §7 documentVersion). */
    version: 1,
    scenario: null,
    nextState: null,
    nextAt: null,
    deliveredAt: null,
  });

  return { ettn, document };
}
