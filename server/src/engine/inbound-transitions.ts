/**
 * GELEN belge geçişleri — sözlük §3.2 ve §3.3.
 *
 * 🔑 OMURGA: gelen belge **İKİ ADIMLIDIR**.
 *
 *   `RECEIVED`  = zarf alındı + belge kaydedildi
 *   `DELIVERED` = VERDİĞİMİZ sistem yanıtı (S_APR) GİB'de TEYİTLENDİ
 *                 = alım GİB nezdinde resmen kapandı
 *
 * Sözlük §9-6 bunu açıkça uyarıyor: *"Tek adımlı bir gelen kutusu, ticari yanıt
 * kapısını (`DOCUMENT_NOT_SETTLED`) hiç öğretmez."* Yani belgeyi doğar doğmaz
 * `DELIVERED` yapan bir mock, geliştiriciye üretimde çarpacağı kapıyı hiç
 * göstermez — bu fazın bütün değeri o ikinci adımdadır.
 *
 * ⚠️ SR zarf başınadır: bir gelen zarf birden çok belge taşıyabilir, tek S_APR
 * hepsini birden ilerletir (sözlük §3.2 dipnotu).
 */
import type { WritableDocStatus } from '../status.js';
import type { TransitionRule, TransitionEvent } from './transitions.js';

/** Gelen yolun ek olayları — `TransitionEvent`'in alt kümesi. */
export type InboundEvent = Extract<
  TransitionEvent,
  'sr_send' | 'sr_confirm' | 'reply_open' | 'reply_settle'
>;

/**
 * S_APR teyidi kabul edilen kodlar — ÖLÇÜLDÜ:
 * `system-response-activities.ts:57-59,122-136` → SR sorgusu `1200` **veya** `1300`.
 * ⚠️ GİDEN yolda `1200` yalnız ara eşiktir; GELEN yolda teyit anlamına gelir.
 * İki düzlemi karıştıran bir motor gelen belgeyi hiç kapatmaz.
 */
export const SR_CONFIRM_CODES = [1200, 1300] as const;

/** Ticari yanıt kapanış kodu — `1300` (sözlük §3.3 Y2/Y3). */
export const REPLY_SETTLE_CODE = 1300;

export const INBOUND_TRANSITIONS: readonly TransitionRule[] = [
  {
    id: 'L10',
    from: ['RECEIVED'],
    event: 'sr_send',
    // Durum DEĞİŞMEZ — bu adım yalnız `sr_sent_at` damgası atar. Belgeyi burada
    // `DELIVERED` yapan bir mock ikinci adımı yok ederdi.
    to: 'RECEIVED',
    source: 'mimforge:services/worker/src/system-response-activities.ts',
    note: 'S_APR (SYSTEMENVELOPE) GİB\'e gönderildi; teyit AYRI adımdır.',
  },
  {
    id: 'L11',
    from: ['RECEIVED'],
    event: 'sr_confirm',
    rawGibCode: (code) => (SR_CONFIRM_CODES as readonly number[]).includes(code),
    codeLabel: SR_CONFIRM_CODES.join(' veya '),
    to: 'DELIVERED',
    deliveredAt: 'set',
    source: 'mimforge:services/worker/src/system-response-activities.ts:122-136',
    note: '🔑 İKİNCİ ADIM: verdiğimiz S_APR GİB\'de teyitlendi → alım resmen kapandı.',
  },
];

/**
 * Yanıt durumu geçişleri (sözlük §3.3). Belge durumundan AYRI bir eksendir:
 * `replyStatus` kolonu yürür, `status` değişmez.
 */
export interface ReplyTransitionRule {
  id: string;
  from: readonly string[];
  event: InboundEvent;
  rawGibCode?: number;
  /** Karar gövdeden gelir (kabul/ret); `null` ise olaydan okunur. */
  to: string | null;
  source: string;
  note?: string;
}

export const REPLY_TRANSITIONS: readonly ReplyTransitionRule[] = [
  {
    id: 'Y1',
    from: ['AWAITING'],
    event: 'reply_open',
    to: 'REPLY_IN_PROGRESS',
    source: 'mimforge:services/api/src/routes.reply.ts:291-292',
    note: 'CAS AWAITING; ayrıca belge DELIVERED olmalı (DOCUMENT_NOT_SETTLED kapısı).',
  },
  {
    id: 'Y2/Y3',
    from: ['REPLY_IN_PROGRESS', 'AWAITING'],
    event: 'reply_settle',
    rawGibCode: REPLY_SETTLE_CODE,
    /** Karar (`ACCEPTED`/`REJECTED`) yanıt açılırken saklanır. */
    to: null,
    source: 'mimforge:services/worker/src/commercial-reply-activities.ts:558-571',
    note: 'Yanıt zarfı 1300 ile kapandı; ret gerekçesi aynı tx\'te yazılır.',
  },
];

/** Yanıt pencereleri — ÖLÇÜLDÜ (sözlük §3.3 dipnotu). */
export const REPLY_WINDOW_DAYS = 8; // fatura, TTK md.21
export const RECEIPT_REPLY_WINDOW_DAYS = 7; // e-İrsaliye

/** Yalnız GELEN `TICARIFATURA` yanıtlanabilir (sözlük §4.4 `NOT_COMMERCIAL`). */
export const COMMERCIAL_PROFILE = 'TICARIFATURA';

export function findReplyTransition(
  from: string,
  event: InboundEvent,
): ReplyTransitionRule | null {
  for (const rule of REPLY_TRANSITIONS) {
    if (!rule.from.includes(from)) continue;
    if (rule.event !== event) continue;
    return rule;
  }
  return null;
}

/** Yanıt doğum kuralı — ÖLÇÜLDÜ: `inbound-envelope-activities.ts:457-463`. */
export function initialReplyStatus(profile: string | null, type: string): string {
  if (type === 'EIRSALIYE') return 'AWAITING';
  return profile === COMMERCIAL_PROFILE ? 'AWAITING' : 'NONE';
}

export type { WritableDocStatus };
