/**
 * SENARYOLAR — geçiş tablosunun üstüne bindirme (plan §5a).
 *
 * Senaryo, tabloyu DEĞİŞTİRMEZ; hangi olayların hangi sırayla ve ne gecikmeyle
 * geleceğini söyler. Geçişin kendisi her zaman `transitions.ts`'ten okunur.
 *
 * 🔴 `gib_stalled` PLAN DÜZELTMESİ (sözlük §5 / plan §5a):
 * Plan taslağı bu senaryoyu `FAILED` ile bitiriyordu. **Ölçüldü ve yanlış:**
 * `send-invoice-workflow.ts:222-227` birebir *"DEADLINE: alarm + AÇIK-BIRAK
 * (plan sözleşmesi) — kapatma YOK"*. 15 günlük poll süresi yalnız ALARM üretir;
 * belge kapanmaz. Ayrıca belge düzleminde `FAILED` diye bir durum YOKTUR
 * (sözlük §6-B: 15 isabetin tamamı zarf düzlemindedir).
 *
 * Mock sadık davranır: belge asılı kalır + alarm. Kullanılabilirlik
 * `_sandbox/clock` ile sağlanır — 15 gün bir saniyede atlanır.
 */
import type { TransitionEvent } from './transitions.js';

export interface ScenarioStep {
  event: TransitionEvent;
  /** Poll olaylarında GİB'in döndüğü ham kod. */
  rawGibCode?: number;
  /** Bir önceki adımdan sonra geçecek süre (ms). */
  delayMs: number;
  /** Bu adım bir alarm üretir (geçiş yapmasa bile). */
  alarm?: string;
  note?: string;
}

export interface Scenario {
  name: string;
  description: string;
  steps: readonly ScenarioStep[];
  /**
   * Adımlar bittiğinde belge ASILI kalır (terminal değil). MimForge'un
   * "AÇIK-BIRAK" davranışı budur; mock uydurma bir terminal durum eklemez.
   */
  endsOpen?: boolean;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;

/**
 * Gerçek poll adımları ÖLÇÜLDÜ: `60s → 120s → 300s → 900s → 1800s`, sonra 1 saat
 * tavan (`send-invoice-workflow.ts:31-32`). Mock varsayılanı bunun ölçekli
 * hâlidir: geliştirici sandbox'ta 60 saniye beklemesin diye kısaltıldı, ama
 * ORAN korundu ve `slow` senaryosu gerçek ölçeğe yaklaşır.
 */
const D = {
  sign: 2 * SECOND,
  submit: 3 * SECOND,
  firstPoll: 5 * SECOND,
  nextPoll: 10 * SECOND,
} as const;

export const SCENARIOS: Readonly<Record<string, Scenario>> = {
  happy: {
    name: 'happy',
    description: 'Varsayılan akış: imza → gönderim → 1200 → 1220 teslim → 1300 zarf kapanışı.',
    steps: [
      { event: 'sign', delayMs: D.sign },
      { event: 'submit', delayMs: D.submit },
      { event: 'poll', rawGibCode: 1200, delayMs: D.firstPoll, note: 'ZARF BASARIYLA ISLENDI (ara eşik)' },
      { event: 'poll', rawGibCode: 1220, delayMs: D.nextPoll, note: '🔑 birincil teslim çıpası' },
      {
        event: 'poll',
        rawGibCode: 1300,
        delayMs: D.nextPoll,
        note: 'zarf kapanışı — belge zaten DELIVERED, durum değişmez',
      },
    ],
  },

  receiver_reject: {
    name: 'receiver_reject',
    description:
      'Teslim sonrası ret — 🔑 1230 GERİ ALINABİLİR TESLİM yolundan. ' +
      'DELIVERED → SEND_FAILED, deliveredAt NULL\'a düşer, DOCUMENT_DELIVERY_REVOKED alarmı.',
    steps: [
      { event: 'sign', delayMs: D.sign },
      { event: 'submit', delayMs: D.submit },
      { event: 'poll', rawGibCode: 1200, delayMs: D.firstPoll },
      { event: 'poll', rawGibCode: 1220, delayMs: D.nextPoll },
      { event: 'poll', rawGibCode: 1230, delayMs: D.nextPoll, note: 'hedef-fail → teslim geri alınır' },
    ],
  },

  gib_stalled: {
    name: 'gib_stalled',
    description:
      '🔴 Belge ASILI KALIR + alarm. MimForge 15 günlük poll deadline\'ında belgeyi ' +
      'KAPATMAZ (send-invoice-workflow.ts:222-227). Sanal saatle 15 gün bir saniyede atlanır.',
    steps: [
      { event: 'sign', delayMs: D.sign },
      { event: 'submit', delayMs: D.submit },
      { event: 'poll', rawGibCode: 1200, delayMs: D.firstPoll },
      {
        event: 'poll',
        rawGibCode: 1210,
        delayMs: D.nextPoll,
        note: 'alıcıya gönderilemedi — GİB kendisi 4×2h dener; belge DOKUNULMAZ',
      },
      {
        event: 'poll',
        rawGibCode: 1210,
        delayMs: 15 * 24 * 60 * MINUTE,
        alarm: 'POLL_DEADLINE',
        note: '15 gün doldu → ALARM + AÇIK BIRAK, kapatma YOK',
      },
    ],
    endsOpen: true,
  },

  gib_error: {
    name: 'gib_error',
    description:
      'Terminal-hata (1150 şematron reddi) → SEND_FAILED. Resend yolu AÇIK; ' +
      'SEND_FAILED terminal DEĞİLDİR.',
    steps: [
      { event: 'sign', delayMs: D.sign },
      { event: 'submit', delayMs: D.submit },
      { event: 'poll', rawGibCode: 1200, delayMs: D.firstPoll },
      {
        event: 'poll',
        rawGibCode: 1150,
        delayMs: D.nextPoll,
        note: 'SCHEMATRON KONTROL SONUCU HATALI — B sınıfı: yeniden imza şart',
      },
    ],
    endsOpen: true,
  },

  /* ── GELEN yol senaryoları (plan M5) ──────────────────────────────────── */

  inbound_happy: {
    name: 'inbound_happy',
    description:
      '🔑 İKİ ADIMLI gelen belge: RECEIVED → S_APR gönderilir → GİB teyitler (1200) ' +
      '→ DELIVERED. Teyit gelmeden belge YANITLANAMAZ (DOCUMENT_NOT_SETTLED).',
    steps: [
      { event: 'sr_send', delayMs: D.sign, note: 'verdiğimiz sistem yanıtı GİB\'e gönderildi' },
      {
        event: 'sr_confirm',
        rawGibCode: 1200,
        delayMs: D.firstPoll,
        note: '🔑 İKİNCİ ADIM — alım GİB nezdinde resmen kapandı',
      },
    ],
  },

  inbound_sr_stalled: {
    name: 'inbound_sr_stalled',
    description:
      '🔴 S_APR teyidi GELMEZ → belge RECEIVED\'da ASILI kalır ve yanıtlanamaz ' +
      '(sözlük §5/H8). Gerçek hayatta olan budur; mock uydurma bir terminal durum eklemez.',
    steps: [{ event: 'sr_send', delayMs: D.sign }],
    endsOpen: true,
  },

  slow: {
    name: 'slow',
    description: 'happy ile aynı yol, tüm gecikmeler ×10. Zaman kumandasını denemek için.',
    steps: [],
  },
};

/** `slow` = `happy` ×10. Tek kaynak: adımlar kopyalanmaz, türetilir. */
const SLOW_FACTOR = 10;
(SCENARIOS as Record<string, Scenario>).slow = {
  ...SCENARIOS.slow!,
  steps: SCENARIOS.happy!.steps.map((step) => ({ ...step, delayMs: step.delayMs * SLOW_FACTOR })),
};

/**
 * Yanıt akışı — `accept`/`reject` çağrısıyla başlar (sözlük §3.3 Y1→Y2/Y3).
 * Belge akışından AYRI bir plandır: `replyStatus` yürür, `status` değişmez.
 */
(SCENARIOS as Record<string, Scenario>).reply_flow = {
  name: 'reply_flow',
  description: 'Ticari yanıt zarfı: REPLY_IN_PROGRESS → 1300 → ACCEPTED/REJECTED.',
  steps: [
    {
      event: 'reply_settle',
      rawGibCode: 1300,
      delayMs: D.firstPoll,
      note: 'yanıt zarfı kapandı; karar açılışta saklanmıştı',
    },
  ],
};

export type ScenarioName = keyof typeof SCENARIOS & string;
export const DEFAULT_SCENARIO: ScenarioName = 'happy';

/** GELEN belgeler için varsayılan senaryo. */
export const DEFAULT_INBOUND_SCENARIO = 'inbound_happy';
/** Yanıt akışının plan adı. */
export const REPLY_SCENARIO = 'reply_flow';

/** Geliştiricinin belge oluştururken seçebileceği senaryolar (giden yol). */
export const SELECTABLE_SCENARIOS = ['happy', 'receiver_reject', 'gib_stalled', 'gib_error', 'slow'] as const;

export function isScenarioName(value: string): value is ScenarioName {
  return Object.hasOwn(SCENARIOS, value);
}
