/**
 * Durum sözlüğü — MimForge'dan ÖLÇÜLDÜ, uydurulmadı.
 *
 * Kaynak: `docs/mimmock-durum-ve-hata-sozlugu-2026-09-22.md` (MimForge deposu),
 * §1.1 / §1.2 / §1.6. Her değerin MimForge'daki `dosya:satır` atfı sözlükte.
 * Sözlük mock'a **kopyalanır, import edilmez** (plan §2c) — MimForge private.
 *
 * 🔴 ÜRETMEYECEĞİMİZ ölü değerler (sözlük §6-B — enumda var, yazıcısı YOK):
 *   `SENT` · belge düzleminde `FAILED` · `SENT_TO_RECEIVER` · `RETURNED`
 * Bunlar `DOC_STATUSES` içinde DURUR (eski veri/CAS toleransı için tanınırlar)
 * ama `WRITABLE_DOC_STATUSES` dışındadır; `assertWritableStatus` bekçidir.
 */

/** Belge durumu — 12 değer (sözlük §1.1, `schema.prisma:24-44`). */
export const DOC_STATUSES = [
  'RECEIVED',
  'AWAITING_SIGNATURE',
  'AWAITING_NUMBERING',
  'PROCESSING',
  'SENT', // 🔴 ölü değer
  'SENT_TO_GIB',
  'SENT_TO_RECEIVER', // 🔴 legacy, yeni yazıcı yok
  'DELIVERED',
  'SEND_FAILED',
  'REPORTED',
  'FAILED', // 🔴 belge düzleminde ölü değer (zarf düzleminde gerçek)
  'CANCELLED',
] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

/** Mock'un YAZABİLECEĞİ durumlar. Ölü değerler kasten dışarıda (sözlük §9-3). */
export const WRITABLE_DOC_STATUSES = [
  'RECEIVED',
  'AWAITING_SIGNATURE',
  'AWAITING_NUMBERING',
  'PROCESSING',
  'SENT_TO_GIB',
  'DELIVERED',
  'SEND_FAILED',
  'REPORTED',
  'CANCELLED',
] as const;
export type WritableDocStatus = (typeof WRITABLE_DOC_STATUSES)[number];

const WRITABLE_SET: ReadonlySet<string> = new Set(WRITABLE_DOC_STATUSES);

/**
 * Ölü değer yazma girişimini PATLATIR.
 * Yardımcı hedefini bulamazsa fırlatmalı — sessiz geçerse sahte yeşil alırız.
 */
export function assertWritableStatus(status: string): WritableDocStatus {
  if (!WRITABLE_SET.has(status)) {
    throw new Error(
      `Ölü/bilinmeyen belge durumu yazılamaz: ${status}. ` +
        `MimForge de üretmiyor (sözlük §6-B); mock da üretmeyecek.`,
    );
  }
  return status as WritableDocStatus;
}

/** Yanıt durumu — 8 değer (sözlük §1.2). `RETURNED` rezerve: yazıcısı yok. */
export const REPLY_STATUSES = [
  'NONE',
  'AWAITING',
  'REPLY_IN_PROGRESS',
  'ACCEPTED',
  'REJECTED',
  'PARTIAL',
  'RETURNED', // 🔴 rezerve
  'DEEMED_ACCEPTED',
] as const;
export type ReplyStatus = (typeof REPLY_STATUSES)[number];

export interface StatusNote {
  /** Tek satır anlam. */
  short: string;
  /** İsteyene ayrıntı. */
  long?: string;
  /**
   * Mock bu değeri bugün ÜRETEBİLİYOR mu. `false` = MimForge'da var, mock'ta
   * yazıcısı ya da tetikleyen uç yok: kodun tanısın ama sandbox'ta göremezsin.
   * (Ölçüldü: mock kaynağında bu değeri yazan yol aranıp bulunamadı.)
   */
  producedByMock: boolean;
}

/**
 * Durumların anlamı — TEK KAYNAK. Panelin terim katmanı ve LLM kılavuzu
 * (`/llms-full.txt`) buradan okur; iki yere yazılsaydı biri eskirdi.
 */
export const DOC_STATUS_NOTES: Readonly<Record<WritableDocStatus, StatusNote>> = {
  RECEIVED: {
    short: 'GİDEN: imzası geçerli belge alındı. GELEN: zarf alındı, S_APR teyidi BEKLENİYOR.',
    long: 'Gelen belgede bu ilk adımdır; ticari yanıt ancak DELIVERED\'dan sonra verilebilir.',
    producedByMock: true,
  },
  AWAITING_SIGNATURE: {
    short: 'İmza bekliyor. JSON ve imzasız UBL yolunun ilk durumu.',
    producedByMock: true,
  },
  AWAITING_NUMBERING: {
    short: 'Seri numarası bekliyor (numarasız belge). İptal yalnız buradan mümkündür.',
    long:
      'Mock numarayı alım sırasında satır içinde aldığı için bu durum kalıcı YAZILMAZ ' +
      '(ingest.ts: imzalı → RECEIVED, değilse → AWAITING_SIGNATURE).',
    producedByMock: false,
  },
  PROCESSING: { short: 'İmzalı; zarf gönderimine hazır ya da gönderiliyor.', producedByMock: true },
  SENT_TO_GIB: { short: 'Zarf GİB\'e ulaştı. Teslim DEĞİL — ara eşik.', producedByMock: true },
  DELIVERED: {
    short: 'Teslim edildi. Çıpa 1220\'dir.',
    long:
      '1300 yalnız 1220 hiç görülmediyse yedek yoldur ve 7–14 gün sonra gelebilir. ' +
      'Sonradan 1230 gelirse teslim GERİ ALINIR (SEND_FAILED).',
    producedByMock: true,
  },
  SEND_FAILED: {
    short: 'Terminal hata kodu geldi ya da teslim geri alındı. Terminal DEĞİL — resend yolu açık.',
    producedByMock: true,
  },
  REPORTED: {
    short: 'e-Arşiv raporuna girdi / zarf kapandı.',
    long: 'e-Arşiv rapor dilimi v2\'ye ertelendi (plan K2); mock bu durumu üretmiyor.',
    producedByMock: false,
  },
  CANCELLED: {
    short: 'İptal edildi (raporsuz-lokal, yalnız giden).',
    long: 'Geçiş tabloda var (G16) ama iptali tetikleyen bir uç henüz yok.',
    producedByMock: false,
  },
};

export const REPLY_STATUS_NOTES: Readonly<Record<ReplyStatus, StatusNote>> = {
  NONE: { short: 'Yanıt ekseni yok (ticari olmayan belge).', producedByMock: true },
  AWAITING: { short: 'Ticari yanıt bekleniyor (TICARIFATURA, 8 gün).', producedByMock: true },
  REPLY_IN_PROGRESS: { short: 'Ticari yanıt zarfı yolda.', producedByMock: true },
  ACCEPTED: { short: 'Kabul edildi (yanıt zarfı 1300 ile kapandı).', producedByMock: true },
  REJECTED: { short: 'Reddedildi (gerekçe zorunlu).', producedByMock: true },
  PARTIAL: { short: 'Kısmi kabul.', producedByMock: false },
  RETURNED: { short: 'Rezerve — MimForge\'da da yazıcısı yok.', producedByMock: false },
  DEEMED_ACCEPTED: { short: 'Süre geçti, zımnen kabul sayıldı.', producedByMock: false },
};


/** Yön (sözlük §1.6). */
export const DIRECTIONS = ['OUTBOUND', 'INBOUND'] as const;
export type Direction = (typeof DIRECTIONS)[number];

/** Belge tipi (sözlük §1.6, `schema.prisma:16-22`). */
export const DOCUMENT_TYPES = ['EFATURA', 'EARSIV', 'EIRSALIYE', 'ESMM', 'EMM'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** v1 kapsamı (plan K2): e-Fatura giden+gelen · e-Arşiv giden. */
export const V1_DOCUMENT_TYPES: readonly DocumentType[] = ['EFATURA', 'EARSIV'];

/**
 * Şematron tip ipucu — ÖLÇÜLDÜ: `ubl-validate/src/index.ts:308-314`.
 * ⚠️ Değerler küçük harf; büyük harf gönderen istemci 400 alır (canlı sonda `:303-305`).
 * `undefined` = ipucu GÖNDERİLMEZ (servis kendi kök tespitine düşer).
 */
export const SCHEMATRON_TYPE_BY_DOC_TYPE: Readonly<Record<DocumentType, string | undefined>> = {
  EFATURA: 'efatura',
  EARSIV: 'earchive',
  EIRSALIYE: 'eirsaliye',
  ESMM: 'earchive',
  EMM: undefined,
};

/** İmza öncesi doğrulama profilleri — ÖLÇÜLDÜ: `ubl-validate/src/index.ts:224-240`. */
export const UNSIGNED_PROFILE_BY_UBL_ROOT: Readonly<Record<string, string>> = {
  invoice: 'unsigned-invoice',
  despatch: 'unsigned-despatch',
  applicationresponse: 'unsigned-applicationresponse',
  receiptadvice: 'unsigned-receiptadvice',
  creditnote: 'unsigned-creditnote',
  esmm: 'unsigned-esmm',
};

/** Numarasız belge profilleri — ÖLÇÜLDÜ: `ubl-validate/src/index.ts:261-272`. */
export const UNNUMBERED_PROFILE_BY_UBL_ROOT: Readonly<Record<string, string>> = {
  invoice: 'unnumbered-invoice',
  despatch: 'unnumbered-despatch',
  creditnote: 'unnumbered-creditnote',
  esmm: 'unnumbered-esmm',
};
