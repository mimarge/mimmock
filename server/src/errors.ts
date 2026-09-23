/**
 * Hata sözleşmesi.
 *
 * Şekil (sözlük §9-8'den ÖLÇÜLDÜ): `errorCode` İngilizce ve KARARLI,
 * `reason` Türkçe insan metni. MimForge'un alan adları bunlardır; plan K10'un
 * "code/message" ifadesi kavramsaldır, alan adı değildir.
 *
 * 🔴 Her kodun `source` alanı vardır ve iki değerden birini taşır:
 *   - `mimforge:<dosya>:<satır>` → MimForge'dan ÖLÇÜLMÜŞ kod
 *   - `mimmock`                  → mock'a özgü; MimForge karşılığı ölçülmedi
 * Kaynağı gösterilemeyen kod bu katalogda duramaz (`error-catalog` testi).
 */

export interface ErrorDefinition {
  status: number;
  reason: string;
  source: string;
}

export const ERROR_CATALOG = {
  /* ── MimForge'dan ölçülmüş (sözlük §4.2 / §4.4) ───────────────────────── */

  BRANCH_REQUIRED: {
    status: 400,
    reason: 'Şube belirsiz: geçerli bir X-Company başlığı gerekli.',
    source: 'mimforge:services/api/src/routes.documents.ts:320',
  },
  CONTEXT: {
    status: 404,
    reason: 'Bağlam varlığı yok: X-Company ile verilen mükellef bu kiracıda tanımlı değil.',
    source: 'mimforge:services/api/src/routes.documents.ts:323',
  },
  FORBIDDEN: {
    status: 403,
    reason: 'Bağlam yetki ihlali.',
    source: 'mimforge:services/api/src/routes.documents.ts:315',
  },
  INVALID_VKN: {
    status: 400,
    reason: 'VKN/TCKN uzunluğu geçersiz — 10 (VKN) veya 11 (TCKN) hane olmalı.',
    source: 'mimforge:services/api/src/routes.reply.ts:204',
  },

  /* ── Mock'a özgü: kimlik ve kaynak yönetimi ───────────────────────────── */
  /* MimForge'da bu yüzeyin karşılığı `packages/auth`tadır ve HTTP kodları M0'da
     ölçülmedi. Bu yüzden "ölçülmüş" diye işaretlenmiyorlar. */

  MISSING_API_KEY: {
    status: 401,
    reason: 'Authorization başlığı yok ya da Bearer biçiminde değil.',
    source: 'mimmock',
  },
  INVALID_API_KEY: {
    status: 401,
    reason: 'API anahtarı tanınmadı.',
    source: 'mimmock',
  },
  TENANT_AMBIGUOUS: {
    status: 400,
    reason: 'Panel kimliğiyle birden çok kiracı görünüyor; X-Tenant başlığıyla seçin.',
    source: 'mimmock',
  },
  COMPANY_NOT_FOUND: {
    status: 404,
    reason: 'Şirket bulunamadı.',
    source: 'mimmock',
  },
  COMPANY_EXISTS: {
    status: 409,
    reason: 'Bu VKN/TCKN bu kiracıda zaten tanımlı.',
    source: 'mimmock',
  },
  VALIDATION_FAILED: {
    status: 400,
    reason: 'İstek gövdesi geçersiz.',
    source: 'mimmock',
  },
  UNKNOWN_PROFILE: {
    status: 400,
    reason: 'Tanınmayan ProfileID değeri.',
    source: 'mimmock',
  },
  NOT_FOUND: {
    status: 404,
    reason: 'Böyle bir uç yok.',
    source: 'mimmock',
  },
  INTERNAL: {
    status: 500,
    reason: 'Beklenmeyen iç hata.',
    source: 'mimmock',
  },

  /* ── İngest kapıları — sözlük §4.2'den ÖLÇÜLDÜ ────────────────────────────
     Sıra NORMATİFTİR: MimForge bu sırayla uygular, mock da öyle yapar. */

  MALFORMED_XML: {
    status: 400,
    reason: 'Gövde geçerli bir UBL belgesi değil.',
    source: 'mimforge:services/api/src/routes.documents.ts:356',
  },
  UNSUPPORTED_TYPE: {
    status: 400,
    reason: 'Bu belge tipi bu fazda desteklenmiyor.',
    source: 'mimforge:services/api/src/routes.documents.ts:383',
  },
  SERIES_PREFIX_NOT_APPLICABLE: {
    status: 400,
    reason: 'Numaralı belgede seri öneki gönderilemez.',
    source: 'mimforge:services/api/src/routes.documents.ts:421',
  },
  DOCNO_FORMAT: {
    status: 400,
    reason: 'Belge-no formatı geçersiz (3 alfanümerik önek + yıl + 9 hane bekleniyor).',
    source: 'mimforge:services/api/src/routes.documents.ts:454',
  },
  DOCNO_YEAR_MISMATCH: {
    status: 400,
    reason: 'Belge-no seri yılı, belge tarihinin yılıyla uyumsuz.',
    source: 'mimforge:services/api/src/routes.documents.ts:467',
  },
  MULTIPLE_TAX_TOTALS: {
    status: 400,
    reason: 'Fatura kökünde birden çok TaxTotal var.',
    source: 'mimforge:services/api/src/routes.documents.ts:488',
  },
  DUPLICATE_UUID: {
    status: 409,
    reason: 'Bu ETTN zaten gönderildi.',
    source: 'mimforge:services/api/src/routes.documents.ts:528',
  },
  DUPLICATE_DOCNO: {
    status: 409,
    reason: 'Bu belge-no zaten kullanıldı.',
    source: 'mimforge:services/api/src/routes.documents.ts:553',
  },
  VALIDATOR_UNAVAILABLE: {
    status: 503,
    reason: 'mimkit doğrulaması şu an yanıt vermiyor (erişilemez, anahtar reddedildi ya da kısıtlandı).',
    source: 'mimforge:services/api/src/routes.documents.ts:584',
  },
  SCHEMA_INVALID: {
    status: 400,
    reason: 'Belge XSD/şematron doğrulamasından geçemedi.',
    source: 'mimforge:services/api/src/routes.documents.ts:817',
  },
  TYPE_UNMAPPED: {
    status: 400,
    reason: 'UBL kökü/ProfileID değerinden belge tipi türetilemedi.',
    source: 'mimforge:services/api/src/routes.documents.ts:141',
  },
  TYPE_MISMATCH: {
    status: 400,
    reason: 'Beyan edilen belge tipi, belgeden çıkarılanla uyuşmuyor.',
    source: 'mimforge:services/api/src/routes.documents.ts:161',
  },
  SENDER_MISMATCH: {
    status: 400,
    reason: 'Belgedeki gönderici, X-Company ile verilen mükellef değil.',
    source: 'mimforge:services/api/src/authz.ts:11',
  },
  RECEIVER_NOT_REGISTERED: {
    status: 400,
    reason: 'e-Fatura alıcısı belge tarihinde sicilde yok — belge e-Arşiv olmalı.',
    source: 'mimforge:services/api/src/routes.documents.ts:1148',
  },
  RECEIVER_REGISTERED: {
    status: 400,
    reason: 'e-Arşiv alıcısı belge tarihinde sicilde var — belge e-Fatura olmalı.',
    source: 'mimforge:services/api/src/routes.documents.ts:1160',
  },
  RECEIVER_VKN_MISSING: {
    status: 400,
    reason: 'Giden e-Faturada alıcı VKN/TCKN yok.',
    source: 'mimforge:services/api/src/routes.documents.ts:1237',
  },
  NO_DEFAULT_SERIES: {
    status: 409,
    reason: 'Bu mükellef için varsayılan seri tanımlı değil.',
    source: 'mimforge:services/api/src/ingest-numbering.ts:145',
  },
  NUMBER_REJECTED: {
    status: 400,
    reason: 'Numaratör numarayı reddetti.',
    source: 'mimforge:services/api/src/ingest-numbering.ts:256',
  },
  NUMBERING_UNAVAILABLE: {
    status: 503,
    reason: 'Numara defteri erişilemez.',
    source: 'mimforge:services/api/src/ingest-numbering.ts:265',
  },
  /* ── Yeniden gönderim (`/resend`) — sözlük §4.3'ten ÖLÇÜLDÜ ─────────────── */

  SEND_IN_PROGRESS: {
    status: 409,
    reason: 'Belge gönderim hattında; yeniden gönderim yalnız SEND_FAILED durumunda.',
    source: 'mimforge:services/api/src/routes.send.ts:171',
  },
  ALREADY_DELIVERED: {
    status: 409,
    reason: 'Belge teslim edildi; yeniden gönderilemez.',
    source: 'mimforge:services/api/src/routes.send.ts:176',
  },
  NOT_RESENDABLE: {
    status: 409,
    reason: 'Belge durumu yeniden gönderime uygun değil.',
    source: 'mimforge:services/api/src/routes.send.ts:178',
  },
  NEEDS_RESIGN: {
    status: 409,
    reason:
      'Son zarfın GİB kodu B sınıfı — zarfı aynen tekrar göndermek aynı reddi üretir. ' +
      'Belgeyi düzeltip aynı ETTN ile YENİDEN gönderin.',
    source: 'mimforge:services/api/src/routes.send.ts:189',
  },
  NOT_RESENDABLE_GIB: {
    status: 409,
    reason: 'Son zarfın GİB kodu C sınıfı (asla/bekle) — yeniden gönderim yolu kapalı.',
    source: 'mimforge:services/api/src/routes.send.ts:194',
  },

  /* ── Ticari yanıt (`/inbox/:id/reply`) — sözlük §4.4'ten ÖLÇÜLDÜ ────────── */

  /**
   * 🔑 M5'in kalbi. Belge henüz uçtan uca tamamlanmadı: verdiğimiz S_APR
   * GİB'de teyitlenmedi, yani belge `DELIVERED` DEĞİL. Tek adımlı bir gelen
   * kutusu bu kapıyı hiç öğretmez (sözlük §9-6).
   */
  DOCUMENT_NOT_SETTLED: {
    status: 409,
    reason:
      'Belge henüz uçtan uca tamamlanmadı: sistem yanıtı (S_APR) GİB\'de teyitlenmedi. ' +
      'Belge DELIVERED olmadan ticari yanıt verilemez.',
    source: 'mimforge:services/api/src/routes.reply.ts:192',
  },
  NOT_COMMERCIAL: {
    status: 409,
    reason: 'Yalnız GELEN TICARIFATURA yanıtlanabilir.',
    source: 'mimforge:services/api/src/routes.reply.ts:189',
  },
  ALREADY_REPLIED: {
    status: 409,
    reason: 'Bu belge zaten yanıtlandı.',
    source: 'mimforge:services/api/src/routes.reply.ts:198',
  },
  REPLY_IN_PROGRESS: {
    status: 409,
    reason: 'Yanıt hattı zaten açık.',
    source: 'mimforge:services/api/src/routes.reply.ts:196',
  },
  REPLY_WINDOW_EXPIRED: {
    status: 409,
    reason: 'Yanıt süresi doldu (fatura için 8 gün, TTK md.21).',
    source: 'mimforge:services/api/src/routes.reply.ts:200',
  },
  EMPTY_REJECT_REASON: {
    status: 400,
    reason: 'Ret yanıtı gerekçesiz olamaz.',
    source: 'mimforge:services/api/src/routes.reply.ts:116',
  },

  /* ── Görüntü / şablon (sözlük §4.2 `TEMPLATE_*` ailesi) ─────────────────── */

  TEMPLATE_UNAVAILABLE: {
    status: 503,
    reason: 'Görüntü servisi erişilemez.',
    source: 'mimforge:services/api/src/routes.documents.ts:690',
  },
  TEMPLATE_NOT_FOUND: {
    status: 404,
    reason: 'Şablon bulunamadı ya da bu mükellefe ait değil.',
    source: 'mimforge:services/api/src/routes.documents.ts:677',
  },
  TEMPLATE_REJECTED: {
    status: 400,
    reason: 'Görüntü servisi isteği reddetti.',
    source: 'mimforge:services/api/src/routes.documents.ts:677',
  },

  DOCUMENT_NOT_FOUND: {
    status: 404,
    reason: 'Belge bulunamadı.',
    source: 'mimforge:services/api/src/routes.send.ts:167',
  },

  /* ── Mock'a özgü: JSON yolu ve çevrimdışı kip ─────────────────────────── */

  /** json2ubl-ts üretimi reddetti — MimForge'da JSON yolu portalda, ingest'te değil. */
  JSON_BUILD_FAILED: {
    status: 400,
    reason: 'JSON gövdesinden UBL üretilemedi.',
    source: 'mimmock',
  },
  /** K4 kapısı bilerek açıkken belge alma uçları kapalıdır. */
  OFFLINE_MODE: {
    status: 503,
    reason: 'MimMock çevrimdışı kipte — mimkit olmadan belge alınmaz (plan K4).',
    source: 'mimmock',
  },
} as const satisfies Record<string, ErrorDefinition>;

export type ErrorCode = keyof typeof ERROR_CATALOG;

/** Doğrulama ayrıntısı — MimForge `SCHEMA_INVALID` gibi `errors[]` taşır. */
export interface FieldError {
  field: string;
  reason: string;
}

export class MimMockError extends Error {
  readonly errorCode: ErrorCode;
  readonly status: number;
  readonly reason: string;
  readonly errors: FieldError[] | undefined;

  constructor(errorCode: ErrorCode, options?: { reason?: string; errors?: FieldError[] }) {
    const definition = ERROR_CATALOG[errorCode];
    const reason = options?.reason ?? definition.reason;
    super(`${errorCode}: ${reason}`);
    this.name = 'MimMockError';
    this.errorCode = errorCode;
    this.status = definition.status;
    this.reason = reason;
    this.errors = options?.errors;
  }

  toBody(): { errorCode: string; reason: string; errors?: FieldError[] } {
    return this.errors
      ? { errorCode: this.errorCode, reason: this.reason, errors: this.errors }
      : { errorCode: this.errorCode, reason: this.reason };
  }
}
