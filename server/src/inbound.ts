/**
 * GELEN belge — plan K7 ve M5.
 *
 * Gelen belge ÜÇ yoldan doğar (K7):
 *   (a) mock'ta tanımlı A → tanımlı B: B'nin gelen kutusuna düşer + webhook.
 *       Tam döngü; tek geliştirici iki tarafı da sınar.
 *   (b) panelden elle (aynı `_sandbox` ucunu kullanır)
 *   (c) `POST /v1/_sandbox/inbox` ham XML — otomatik test için ŞART
 *
 * 🔑 Hangi yoldan doğarsa doğsun belge `RECEIVED` durumunda başlar ve
 * `DELIVERED`'a ancak S_APR teyidiyle geçer (iki adımlı akış, sözlük §3.2).
 */
import { randomUUID } from 'node:crypto';
import { MimMockError } from './errors.js';
import { parseUbl, documentTypeFromUbl, UblParseError } from './ubl/parse.js';
import { initialReplyStatus, REPLY_WINDOW_DAYS } from './engine/inbound-transitions.js';
import { DEFAULT_INBOUND_SCENARIO } from './engine/scenarios.js';
import { assertWritableStatus } from './status.js';
import type { CompanyRow, DocumentRow, Repo } from './db/repo.js';
import type { Engine } from './engine/engine.js';
import type { Clock } from './engine/clock.js';

export interface InboundInput {
  xml: string;
  /** Alıcı mükellef — gelen kutusunun sahibi. */
  receiver: CompanyRow;
  tenantId: string;
  /** Hangi giden belgeden doğdu (K7a); elle/enjeksiyonda null. */
  sourceDocumentId?: string | null;
  scenario?: string | undefined;
}

export interface InboundDeps {
  repo: Repo;
  engine: Engine;
  clock: Clock;
}

/**
 * Gelen belgeyi yaratır ve S_APR akışına bağlar.
 *
 * ⚠️ Gelen yolda ingest kapıları (DOCNO biçimi, sicil, TaxTotal) UYGULANMAZ:
 * belge zaten GİB'den geliyor, bizim doğrulama kapılarımız GÖNDERİM içindir.
 * MimForge de gelen zarfı ayrı bir yoldan (`inbound-envelope-activities`) işler.
 * Yalnız ayrıştırılabilirlik ve tekillik aranır.
 */
export async function createInboundDocument(
  input: InboundInput,
  deps: InboundDeps,
): Promise<DocumentRow> {
  let parsed;
  try {
    parsed = parseUbl(input.xml);
  } catch (error) {
    if (error instanceof UblParseError) {
      throw new MimMockError('MALFORMED_XML', { reason: error.message });
    }
    throw error;
  }

  const docType = documentTypeFromUbl(parsed.root, parsed.profileId, parsed.typeCode);
  if (docType === null) {
    throw new MimMockError('TYPE_UNMAPPED', {
      reason: `Gelen belgenin tipi çözülemedi (kök=${parsed.root}, profil=${parsed.profileId ?? '—'}).`,
    });
  }

  const ettn = parsed.ettn ?? randomUUID();
  const existing = await deps.repo.findDocumentByEttn(input.tenantId, ettn, 'INBOUND');
  if (existing) {
    // Aynı ETTN'in ikinci kez gelmesi GİB tarafında mükerrer push'tur; MimForge
    // bunu zarf düzleminde `2001` ile karşılar. Mock belge düzleminde 409 der.
    throw new MimMockError('DUPLICATE_UUID', {
      reason: `Bu ETTN gelen kutusunda zaten var: ${ettn}`,
    });
  }

  const now = deps.clock.now();
  const document = await deps.repo.insertDocument({
    id: `doc_${randomUUID()}`,
    tenantId: input.tenantId,
    companyId: input.receiver.id,
    ettn,
    direction: 'INBOUND',
    type: docType,
    profile: parsed.profileId,
    typeCode: parsed.typeCode,
    /* 🔑 BİRİNCİ ADIM: zarf alındı + belge kaydedildi. DELIVERED DEĞİL. */
    status: assertWritableStatus('RECEIVED'),
    rawGibCode: null,
    /* Yanıt doğum kuralı ölçüldü: `inbound-envelope-activities.ts:457-463`. */
    replyStatus: initialReplyStatus(parsed.profileId, docType),
    documentNumber: parsed.documentNumber,
    issueDate: parsed.issueDate ?? now.toISOString().slice(0, 10),
    senderVkn: parsed.senderVkn,
    receiverVkn: parsed.receiverVkn ?? input.receiver.vkn,
    currencyCode: parsed.currencyCode,
    payableAmount: parsed.payableAmount,
    ublXml: input.xml,
    sourceJson: null,
    sourceKind: 'ubl',
    appliedXsd: null,
    appliedSchematron: null,
    numberReservationId: null,
    signatureKind: parsed.hasSignature ? 'test-certificate' : null,
    signedAt: parsed.hasSignature ? now : null,
    srSentAt: null,
    srConfirmedAt: null,
    srCode: null,
    replyDecision: null,
    replyReason: null,
    replyAt: null,
    /*
     * Yanıt penceresi çıpası — ÖLÇÜLDÜ (`deemed-accept-activities.ts:100-103`):
     * GELEN belgede ALIM anı, GİDEN belgede teslim anı.
     */
    replyDeadlineAt: new Date(now.getTime() + REPLY_WINDOW_DAYS * 24 * 60 * 60 * 1000),
    sourceDocumentId: input.sourceDocumentId ?? null,
    /** Üreteç yazdıysa sonradan işaretlenir (plan §5b). */
    generated: false,
    generatedScenario: null,
    version: 1,
    scenario: null,
    nextState: null,
    nextAt: null,
    deliveredAt: null,
  });

  // S_APR akışını başlat: RECEIVED → (sr_send) → (sr_confirm) → DELIVERED.
  await deps.engine.schedule(document.id, input.scenario ?? DEFAULT_INBOUND_SCENARIO);
  return document;
}

/**
 * K7a — şirketler-arası teslim. Giden belge GİB'de teslim edildiğinde
 * (`1220 → DELIVERED`), alıcı bu kiracıda TANIMLIYSA onun gelen kutusuna bir
 * kopya düşer.
 *
 * 🔑 Bu, mock'un en öğretici özelliğidir: tek geliştirici iki tarafı da sınar.
 * Alıcı tanımlı değilse hiçbir şey olmaz — o belge zaten e-Arşiv yoluna
 * düşmüştür (ingest'in `RECEIVER_NOT_REGISTERED` kapısı).
 */
export async function deliverToInbox(
  outgoing: DocumentRow,
  deps: InboundDeps,
): Promise<DocumentRow | null> {
  if (outgoing.direction !== 'OUTBOUND') return null;
  if (outgoing.receiverVkn === null) return null;

  const receiver = await deps.repo.findCompany(outgoing.tenantId, outgoing.receiverVkn);
  if (!receiver) return null; // tanımsız alıcı → gelen kutusu yok, doğal

  // Aynı belgeden iki kez gelen kutusu üretme (teslim iki kez damgalanabilir).
  const already = await deps.repo.findDocumentBySource(outgoing.tenantId, outgoing.id);
  if (already) return null;

  return createInboundDocument(
    {
      xml: outgoing.ublXml,
      receiver,
      tenantId: outgoing.tenantId,
      sourceDocumentId: outgoing.id,
    },
    deps,
  );
}
