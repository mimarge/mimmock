/**
 * GEÇİŞ TABLOSU — 🔴 KOD DEĞİL VERİ (plan §5a-3).
 *
 * Kaynak: sözlük §3.1 (e-Fatura GİDEN, G1–G16). Her satırın MimForge'daki
 * `dosya:satır` atfı `source` alanındadır.
 *
 * 🔴 SÖZLÜK §6-C / §9-1 UYARISI: bu tablo `packages/domain`'in BEYAN EDİLEN
 * geçiş haritasından DEĞİL, gerçekte uygulanan CAS `fromStatuses` listelerinden
 * kurulmuştur. `domain` haritası daha gevşektir (örn. `PROCESSING → SENT`
 * izinlidir ama `SENT`'in yazıcısı yoktur); onu taklit eden bir mock MimForge'un
 * İZİN VERMEDİĞİ geçişleri üretirdi.
 *
 * Ölçüm iyileştiğinde burada bir satır düzelir, dağılmış `switch` dalları değil.
 */
import type { WritableDocStatus } from '../status.js';
import { INBOUND_TRANSITIONS } from './inbound-transitions.js';

/** Motorun tanıdığı olaylar. Poll olayları ham GİB kodunu taşır. */
export type TransitionEvent =
  /* ── GİDEN yol ── */
  | 'sign' // imza/mühür tamamlandı
  | 'submit' // zarf GİB'e POST edildi
  | 'poll' // GİB durum sorgusu döndü
  | 'resend' // geliştirici yeniden gönderdi
  | 'cancel' // iptal
  /* ── GELEN yol (sözlük §3.2) ── */
  | 'sr_send' // verdiğimiz S_APR GİB'e gönderildi
  | 'sr_confirm' // S_APR teyitlendi → 🔑 ikinci adım
  /* ── Yanıt ekseni (sözlük §3.3) ── */
  | 'reply_open'
  | 'reply_settle';

export interface TransitionRule {
  /** Sözlükteki satır kimliği (G5, G9 …) — izlenebilirlik için. */
  id: string;
  /** CAS `fromStatuses` — gerçekte uygulanan kısıt. Boş dizi = giriş geçişi. */
  from: readonly WritableDocStatus[];
  event: TransitionEvent;
  /** Poll olaylarında ham GİB kodu eşleşmesi. */
  rawGibCode?: number | ((code: number) => boolean);
  /**
   * `rawGibCode` bir fonksiyonsa, eşlediği kod kümesinin insan-okur tarifi.
   * Belgeler (OpenAPI, `/llms-full.txt`) tabloyu buradan okur — fonksiyon
   * okunamaz, küme ikinci bir yerde yazılırsa kopya olurdu.
   */
  codeLabel?: string;
  to: WritableDocStatus;
  /** Teslim damgası etkisi. `clear` = `1230` geri alma yolu. */
  deliveredAt?: 'set' | 'clear';
  /** Üretilecek alarm kodu (sözlük §4.6). */
  alarm?: string;
  source: string;
  note?: string;
}

/**
 * Terminal-fail kümesi — ÖLÇÜLDÜ: `send-invoice-activities.ts:106-112`
 * `isTerminalFailCode(code) = (1110 ≤ code ≤ 1195) || code===1215 || code===1230 || code===1235`
 *
 * ⚠️ `1230` bu kümededir AMA kendi satırı vardır (G12): `DELIVERED`'dan gelirse
 * teslimi GERİ ALIR. Sıra önemlidir; G12 G11'den ÖNCE denenir.
 */
export function isTerminalFailCode(code: number): boolean {
  return (code >= 1110 && code <= 1195) || code === 1215 || code === 1230 || code === 1235;
}

/** Ara kodlar — terminal DEĞİL, poll sürer (sözlük §2.1). */
export const INTERMEDIATE_CODES = [1000, 1100, 1200, 1210, 1220] as const;

/** 🔑 Birincil teslim çıpası. SSOT: `gib-envelope/src/workflow-contract.ts:74`. */
export const DELIVERED_GIB_CODES = [1220] as const;

/** Zarf kapanışı — belge `DELIVERED`'ı için yalnız FALLBACK (sözlük §6-A). */
export const ENVELOPE_CLOSE_CODE = 1300;

/**
 * Poll sonrası `PROCESSING|SENT_TO_GIB|SENT_TO_RECEIVER` üçlüsü.
 * `SENT_TO_RECEIVER` legacy'dir (yeni yazıcısı yok) ama CAS listesinde TOLERE
 * edilir — sözlük §1.1/7. Mock onu ÜRETMEZ, yalnız listede tanır.
 */
const POLL_FROM = ['PROCESSING', 'SENT_TO_GIB'] as const satisfies readonly WritableDocStatus[];

/** GİDEN yol kuralları. Gelen yol `inbound-transitions.ts`'te ve aşağıda birleşir. */
const OUTBOUND_TRANSITIONS: readonly TransitionRule[] = [
  // ── İmza / numaralama ekseni ────────────────────────────────────────────
  {
    id: 'G5',
    from: ['RECEIVED'],
    event: 'sign',
    to: 'PROCESSING',
    source: 'mimforge:services/worker/src/activities.ts:256-257',
    note: 'İmza zaten geçerli; persist sonrası gönderime hazır.',
  },
  {
    id: 'G6',
    from: ['AWAITING_SIGNATURE'],
    event: 'sign',
    to: 'PROCESSING',
    source: 'mimforge:services/worker/src/activities.ts:259-262',
    note: 'ÖE mührü + self-verify + post-imza şematron.',
  },

  // ── Gönderim ekseni ─────────────────────────────────────────────────────
  {
    id: 'G7',
    from: ['PROCESSING'],
    event: 'submit',
    to: 'SENT_TO_GIB',
    source: 'mimforge:services/worker/src/send-invoice-activities.ts:944-946',
    note: 'submitEnvelope başarı (SOAP POST kabul) — ham kod YOK.',
  },
  {
    id: 'G8',
    from: ['PROCESSING'],
    event: 'poll',
    rawGibCode: 1200,
    to: 'SENT_TO_GIB',
    source: 'mimforge:services/worker/src/send-invoice-activities.ts:1115-1120',
    note: '1200 ara eşik — bitiş DEĞİL.',
  },

  /*
   * 🔴 G12 G11'DEN ÖNCE: `1230` terminal-fail kümesindedir ama `DELIVERED`'dan
   * gelirse teslimi GERİ ALIR. Sıra ters kurulursa geri alma hiç görünmez.
   */
  {
    id: 'G12',
    from: ['DELIVERED'],
    event: 'poll',
    rawGibCode: 1230,
    to: 'SEND_FAILED',
    deliveredAt: 'clear',
    alarm: 'DOCUMENT_DELIVERY_REVOKED',
    source: 'mimforge:services/worker/src/send-invoice-activities.ts:254-262',
    note: '🔑 GERİ ALINABİLİR TESLİM — yalnız DELIVERED\'dan.',
  },

  {
    id: 'G9',
    from: POLL_FROM,
    event: 'poll',
    rawGibCode: 1220,
    to: 'DELIVERED',
    deliveredAt: 'set',
    source: 'mimforge:services/worker/src/send-invoice-activities.ts:1130-1133',
    note: '🔑 BİRİNCİL teslim çıpası. Müşteri-görünen teslim anı; TTK 8-gün buradan işler.',
  },
  {
    id: 'G10',
    from: POLL_FROM,
    event: 'poll',
    rawGibCode: ENVELOPE_CLOSE_CODE,
    to: 'DELIVERED',
    deliveredAt: 'set',
    source: 'mimforge:services/worker/src/send-invoice-activities.ts:1069-1072',
    note: '1300 zarf kapanışı — belge teslimi için yalnız FALLBACK (1220 hiç görülmediyse).',
  },
  {
    id: 'G11',
    from: POLL_FROM,
    event: 'poll',
    rawGibCode: (code) => isTerminalFailCode(code),
    codeLabel: '1110–1195, 1215, 1230, 1235 (terminal-fail kümesi)',
    to: 'SEND_FAILED',
    source: 'mimforge:services/worker/src/send-invoice-activities.ts:265-268',
    note: 'Terminal-fail; resend yolu AÇIK (terminal DEĞİL).',
  },
  {
    id: 'G15',
    from: ['SEND_FAILED'],
    event: 'resend',
    to: 'PROCESSING',
    source: 'mimforge:services/api/src/routes.send.ts:81',
    note: 'attempt+1, yeni zarf-UUID.',
  },

  // ── İptal ───────────────────────────────────────────────────────────────
  {
    id: 'G16',
    from: ['AWAITING_NUMBERING'],
    event: 'cancel',
    to: 'CANCELLED',
    source: 'mimforge:services/api/src/routes.earsiv.ts:621-637',
    note: 'Raporsuz-lokal iptal; yalnız OUTBOUND.',
  },
];

/**
 * Motorun okuduğu TAM tablo: giden + gelen.
 * Sıra korunur — giden kurallar önce denenir, gelen kurallar kendi
 * `from`/`event` çiftleriyle zaten ayrışır.
 */
export const TRANSITIONS: readonly TransitionRule[] = [
  ...OUTBOUND_TRANSITIONS,
  ...INBOUND_TRANSITIONS,
];

export interface TransitionQuery {
  from: string;
  event: TransitionEvent;
  rawGibCode?: number | undefined;
}

/**
 * Tabloda eşleşen ilk kuralı döndürür. **Sıra anlamlıdır** (G12 < G11).
 * Eşleşme yoksa `null` — çağıran no-op yapar; MimForge'un CAS'i de öyle davranır
 * (`where` tutmazsa satır güncellenmez, IO'suz no-op).
 */
export function findTransition(query: TransitionQuery): TransitionRule | null {
  for (const rule of TRANSITIONS) {
    if (!rule.from.includes(query.from as WritableDocStatus)) continue;
    if (rule.event !== query.event) continue;
    if (rule.rawGibCode !== undefined) {
      if (query.rawGibCode === undefined) continue;
      const matches =
        typeof rule.rawGibCode === 'function'
          ? rule.rawGibCode(query.rawGibCode)
          : rule.rawGibCode === query.rawGibCode;
      if (!matches) continue;
    }
    return rule;
  }
  return null;
}
