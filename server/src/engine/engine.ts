/**
 * MOTOR — plan §5a.
 *
 * Üç tasarım gerekçesi (plandan, birebir korunuyor):
 *
 * 1. **Yeniden başlatmaya dayanıklı.** Durum bellekteki zamanlayıcılarda değil
 *    VERİTABANINDA. Container kapanıp açılınca belgeler yoluna devam eder.
 *    Bellekte `setTimeout` tutan tasarım her restart'ta belgeleri dondururdu.
 * 2. **Saat kumandası altında belirlenimli.** `_sandbox/clock` vadesi geleni
 *    ateşler; bir haftalık akış saniyeler içinde koşar.
 * 3. **Geçiş tablosu KOD DEĞİL VERİ.** Motor `transitions.ts`'i okur; burada
 *    tek bir `switch (status)` dalı yoktur.
 */
import { and, lte, isNotNull, eq } from 'drizzle-orm';
import { findTransition, type TransitionEvent, type TransitionRule } from './transitions.js';
import { findReplyTransition, type InboundEvent } from './inbound-transitions.js';
import { SCENARIOS, DEFAULT_SCENARIO, type Scenario, type ScenarioStep } from './scenarios.js';
import type { Clock } from './clock.js';
import type { DbHandle } from '../db/client.js';
import type { DocumentRow, Repo } from '../db/repo.js';
import { assertWritableStatus } from '../status.js';
import { signUbl, hasSignature } from '../signing/sign.js';

export interface EngineDeps {
  handle: DbHandle;
  repo: Repo;
  clock: Clock;
  /** Geçiş gerçekleştiğinde çağrılır — M4'te webhook buraya takılır. */
  onTransition?: (event: TransitionOutcome) => void | Promise<void>;
  /**
   * Belge teslim edildiğinde çağrılır (K7a: şirketler-arası teslim).
   * Motor gelen belgeyi KENDİSİ yaratmaz — o iş `inbound.ts`'in; motor yalnız
   * "teslim oldu" der. Böylece motor ingest'e bağımlı kalmaz.
   */
  onDelivered?: (event: TransitionOutcome) => void | Promise<void>;
}

export interface TransitionOutcome {
  documentId: string;
  tenantId: string;
  companyId: string;
  ruleId: string;
  from: string;
  to: string;
  rawGibCode: number | null;
  alarm: string | null;
  at: Date;
  /** Geçiş SONRASI belge sürümü (plan §7). */
  documentVersion: number;
  /** `set` → damga, `null` → geri alma, `undefined` → dokunulmadı. */
  deliveredAt?: Date | null | undefined;
  /** Hangi eksen yürüdü: belge durumu mu, yanıt durumu mu (sözlük §3.3). */
  axis?: 'status' | 'reply';
}

/** `nextState` kolonunda saklanan adım göstergesi: `<senaryo>#<indeks>`. */
function encodeStep(scenario: string, index: number): string {
  return `${scenario}#${index}`;
}

function decodeStep(value: string | null): { scenario: string; index: number } | null {
  if (!value) return null;
  const [scenario, raw] = value.split('#');
  const index = Number(raw);
  if (!scenario || !Number.isInteger(index)) return null;
  return { scenario, index };
}

function scenarioOf(name: string | null): Scenario {
  return SCENARIOS[name ?? DEFAULT_SCENARIO] ?? SCENARIOS[DEFAULT_SCENARIO]!;
}

export interface Engine {
  /** Belgeyi bir senaryoya bağlar ve ilk adımı zamanlar. */
  schedule(documentId: string, scenarioName?: string): Promise<void>;
  /** Vadesi gelen tüm belgeleri ilerletir. Döndürdüğü liste uygulanan geçişlerdir. */
  tick(): Promise<TransitionOutcome[]>;
  /** Tek belgeyi bir adım ilerletir (`_sandbox/advance`). */
  advanceOne(tenantId: string, documentId: string): Promise<TransitionOutcome | null>;
  /** Arıza enjekte eder (`_sandbox/fail`): verilen ham kodu poll gibi uygular. */
  injectFailure(
    tenantId: string,
    documentId: string,
    rawGibCode: number,
    reason?: string,
  ): Promise<TransitionOutcome | null>;
  /** `SEND_FAILED → PROCESSING` (G15). Senaryo baştan zamanlanır. */
  resend(tenantId: string, documentId: string): Promise<TransitionOutcome | null>;
  start(intervalMs: number): void;
  stop(): void;
}

export function createEngine(deps: EngineDeps): Engine {
  const { handle, repo, clock } = deps;
  const { db, tables } = handle;
  let timer: NodeJS.Timeout | null = null;

  /**
   * Sıradaki adımı zamanlar; adım kalmadıysa belgeyi AÇIK bırakır.
   *
   * 🔑 `base` = zincirin sayacağı an. tick'te bu, AZ ÖNCE VADESİ GELEN adımın
   * kendi vadesidir — şu anki saat değil. İkisi aynı sayılırsa kaçırılan zaman
   * yutulur ve iki sonuç birden bozulur:
   *   - `_sandbox/clock` ile 15 gün atlamak zinciri bitirmez, her adım için ayrı
   *     atlama gerekir (plan §5a-2'nin vaat ettiği şey bu değil);
   *   - container bir saat kapalı kalırsa belgeler bir saat geri kalır, oysa
   *     "kapatıp açar, belgeler yoluna devam eder" (plan §5a-1) demiştik.
   */
  async function scheduleStep(
    document: DocumentRow,
    scenario: Scenario,
    index: number,
    base?: Date,
  ): Promise<void> {
    const step = scenario.steps[index];
    if (!step) {
      // Adım kalmadı. Terminal durum UYDURULMAZ — MimForge de kapatmıyor.
      await db
        .update(tables.documents)
        .set({ nextState: null, nextAt: null, updatedAt: clock.now() })
        .where(eq(tables.documents.id, document.id));
      return;
    }
    const from = base ?? clock.now();
    await db
      .update(tables.documents)
      .set({
        scenario: scenario.name,
        nextState: encodeStep(scenario.name, index),
        nextAt: new Date(from.getTime() + step.delayMs),
        updatedAt: clock.now(),
      })
      .where(eq(tables.documents.id, document.id));
  }

  /**
   * Bir adımı uygular. Geçiş tablosunda eşleşme yoksa durum DEĞİŞMEZ ama adım
   * ilerler — MimForge'un davranışı da budur: ara kodlar (`1000/1100/1210`)
   * yalnız poll izi bırakır, belgeye dokunmaz (`send-invoice-activities.ts:1140-1146`).
   */
  /** Yanıt ekseni olayları — belge DURUMUNU değil `replyStatus`'u yürütür. */
  const REPLY_EVENTS: readonly TransitionEvent[] = ['reply_open', 'reply_settle'];

  /**
   * Yanıt geçişi (sözlük §3.3). Ayrı eksen: `status` kolonuna DOKUNMAZ.
   * Karar (`ACCEPTED`/`REJECTED`) yanıt açılırken saklanmıştır; kapanışta okunur.
   */
  async function applyReplyStep(
    document: DocumentRow,
    step: ScenarioStep,
  ): Promise<TransitionOutcome | null> {
    const rule = findReplyTransition(document.replyStatus, step.event as InboundEvent);
    if (!rule) return null;

    const now = clock.now();
    // `to: null` = karar açılışta saklanan `replyDecision`'dan okunur.
    const to = rule.to ?? document.replyDecision ?? 'ACCEPTED';

    const updated = await db
      .update(tables.documents)
      .set({
        replyStatus: to,
        replyAt: now,
        rawGibCode: step.rawGibCode ?? document.rawGibCode,
        updatedAt: now,
        version: document.version + 1,
      })
      .where(
        and(
          eq(tables.documents.id, document.id),
          eq(tables.documents.replyStatus, document.replyStatus),
        ),
      )
      .returning();
    if (updated.length === 0) return null;

    const outcome: TransitionOutcome = {
      documentId: document.id,
      tenantId: document.tenantId,
      companyId: document.companyId,
      ruleId: rule.id,
      from: document.replyStatus,
      to,
      rawGibCode: step.rawGibCode ?? null,
      alarm: null,
      at: now,
      documentVersion: document.version + 1,
      axis: 'reply',
    };
    await deps.onTransition?.(outcome);
    return outcome;
  }

  async function applyStep(
    document: DocumentRow,
    step: ScenarioStep,
  ): Promise<TransitionOutcome | null> {
    if (REPLY_EVENTS.includes(step.event)) return applyReplyStep(document, step);
    const rule = findTransition({
      from: document.status,
      event: step.event,
      rawGibCode: step.rawGibCode,
    });

    const now = clock.now();
    const alarm = step.alarm ?? rule?.alarm ?? null;

    if (!rule) {
      // Durum değişmiyor; ham kod ve alarm yine de kaydedilir (poll izi).
      if (step.rawGibCode !== undefined || alarm) {
        await db
          .update(tables.documents)
          .set({ rawGibCode: step.rawGibCode ?? document.rawGibCode, updatedAt: now })
          .where(eq(tables.documents.id, document.id));
      }
      return alarm
        ? {
            documentId: document.id,
            tenantId: document.tenantId,
            companyId: document.companyId,
            ruleId: 'no-transition',
            from: document.status,
            to: document.status,
            rawGibCode: step.rawGibCode ?? null,
            alarm,
            at: now,
            documentVersion: document.version,
          }
        : null;
    }

    return applyRule(document, rule, step.rawGibCode ?? null, alarm, now);
  }

  /**
   * Kuralı CAS ile uygular: `where status IN (rule.from)`. Satır o arada
   * değiştiyse güncelleme TUTMAZ ve no-op olur — MimForge'un terminal-yazma
   * kilidiyle aynı davranış (`send-invoice-activities.ts:965-967`): geç gelen bir
   * kod bir `DELIVERED`'ı asla ezemez.
   */
  async function applyRule(
    document: DocumentRow,
    rule: TransitionRule,
    rawGibCode: number | null,
    alarm: string | null,
    now: Date,
  ): Promise<TransitionOutcome | null> {
    const to = assertWritableStatus(rule.to);
    // Her geçiş belgenin SÜRÜMÜNÜ artırır: webhook tüketicisi sıralamaya
    // güvenemez (plan §7), tazeliği bu sayıdan anlar.
    const patch: Record<string, unknown> = { status: to, updatedAt: now, version: document.version + 1 };

    /*
     * 🔴 G6 (ÖE mührü) SADECE durum değiştirmez — belgeyi GERÇEKTEN imzalar.
     * Yalnız durumu ilerleten bir mock, imza doğrulaması yazan geliştiriciye
     * "imzalandı" der ama belgede imza olmaz; bu sessiz yalan tam da sandbox'ın
     * önlemesi gereken şeydir. İmza TEST sertifikasıyladır (plan K9).
     */
    // S_APR gönderimi damgalanır (sözlük §3.2 L10) — teyit AYRI bir adımdır.
    if (rule.event === 'sr_send') patch.srSentAt = now;
    if (rule.event === 'sr_confirm') {
      patch.srConfirmedAt = now;
      patch.srCode = rawGibCode;
    }

    if (rule.event === 'sign' && !hasSignature(document.ublXml)) {
      try {
        const signature = signUbl(document.ublXml);
        patch.ublXml = signature.xml;
        patch.signatureKind = signature.info.kind;
        patch.signedAt = now;
      } catch (error) {
        // İmza düşerse durum da ilerlemez: belge AWAITING_SIGNATURE'da kalır.
        // MimForge'un K6 kararı da budur — imza zinciri belgeyi terminal YAPAMAZ,
        // sınırsız retry + DOCUMENT_SIGN_STALLED alarmı (sözlük §5/H3).
        void error;
        return null;
      }
    }
    if (rawGibCode !== null) patch.rawGibCode = rawGibCode;
    if (rule.deliveredAt === 'set') patch.deliveredAt = now;
    if (rule.deliveredAt === 'clear') patch.deliveredAt = null;

    const updated = await db
      .update(tables.documents)
      .set(patch)
      .where(and(eq(tables.documents.id, document.id), eq(tables.documents.status, document.status)))
      .returning();

    if (updated.length === 0) return null; // CAS tutmadı → no-op

    const outcome: TransitionOutcome = {
      documentId: document.id,
      ruleId: rule.id,
      from: document.status,
      to,
      rawGibCode,
      alarm: alarm ?? rule.alarm ?? null,
      at: now,
      documentVersion: document.version + 1,
      tenantId: document.tenantId,
      companyId: document.companyId,
      deliveredAt: rule.deliveredAt === 'set' ? now : rule.deliveredAt === 'clear' ? null : undefined,
      axis: 'status',
    };
    await deps.onTransition?.(outcome);
    /*
     * K7a — teslim anı, şirketler-arası gelen belgenin doğduğu andır.
     * Kanca `onTransition`'dan AYRI: webhook her geçişte gider, gelen kutusu
     * yalnız teslimde doğar.
     */
    if (rule.deliveredAt === 'set') await deps.onDelivered?.(outcome);
    return outcome;
  }

  /** Bir tur: vadesi gelen her belgeye BİR adım uygular. Uygulanan var mı döner. */
  async function tickOnce(outcomes: TransitionOutcome[]): Promise<boolean> {
    const due = await db
      .select()
      .from(tables.documents)
      .where(and(isNotNull(tables.documents.nextAt), lte(tables.documents.nextAt, clock.now())));
    if (due.length === 0) return false;

    let applied = false;
    for (const document of due) {
      const pointer = decodeStep(document.nextState);
      if (!pointer) continue;
      const scenario = scenarioOf(pointer.scenario);
      const step = scenario.steps[pointer.index];
      if (!step) {
        // Adım kalmadı: `nextAt` temizlenir, belge AÇIK kalır.
        await scheduleStep(document, scenario, pointer.index);
        applied = true;
        continue;
      }
      // Zincirin tabanı: bu adımın KENDİ vadesi (kaçırılan zaman telafi edilir).
      const dueAt = document.nextAt ?? clock.now();
      const outcome = await applyStep(document, step);
      if (outcome) outcomes.push(outcome);
      // Durum değişmiş olabilir; sıradaki adımı GÜNCEL satırla zamanla.
      const refreshed = (
        await db.select().from(tables.documents).where(eq(tables.documents.id, document.id)).limit(1)
      )[0];
      if (refreshed) await scheduleStep(refreshed, scenario, pointer.index + 1, dueAt);
      applied = true;
    }
    return applied;
  }

  return {
    async schedule(documentId, scenarioName) {
      const rows = await db
        .select()
        .from(tables.documents)
        .where(eq(tables.documents.id, documentId))
        .limit(1);
      const document = rows[0];
      if (!document) return;
      await scheduleStep(document, scenarioOf(scenarioName ?? document.scenario), 0);
    },

    /**
     * 🔑 Plan §5a-2: *"sanal zamanı ileri atınca vadesi gelen TÜM geçişler
     * ateşlenir"*. Bir adım uygulandıktan sonra bir sonraki de vadesi gelmiş
     * olabilir (saat 15 gün atlamışsa hepsi gelmiştir) — bu yüzden vadesi gelen
     * kalmayana dek dönülür. `MAX_ROUNDS` sonsuz döngüye karşı emniyet: bir
     * senaryo bu kadar adım taşımaz, taşıyorsa tabloda hata vardır.
     */
    async tick() {
      const MAX_ROUNDS = 100;
      const outcomes: TransitionOutcome[] = [];
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const applied = await tickOnce(outcomes);
        if (!applied) break;
      }
      return outcomes;
    },
    async advanceOne(tenantId, documentId) {
      const document = await repo.findDocumentById(tenantId, documentId);
      if (!document) return null;
      const pointer = decodeStep(document.nextState);
      if (!pointer) return null;
      const scenario = scenarioOf(pointer.scenario);
      const step = scenario.steps[pointer.index];
      if (!step) return null;

      const outcome = await applyStep(document, step);
      const refreshed = await repo.findDocumentById(tenantId, documentId);
      if (refreshed) await scheduleStep(refreshed, scenario, pointer.index + 1);
      return outcome;
    },

    async injectFailure(tenantId, documentId, rawGibCode, reason) {
      const document = await repo.findDocumentById(tenantId, documentId);
      if (!document) return null;
      const rule = findTransition({ from: document.status, event: 'poll', rawGibCode });
      const now = clock.now();
      if (!rule) {
        // Kod bu durumda geçiş üretmiyor — ham kodu yine de işle (poll izi).
        await db
          .update(tables.documents)
          .set({ rawGibCode, updatedAt: now })
          .where(eq(tables.documents.id, document.id));
        return null;
      }
      return applyRule(document, rule, rawGibCode, reason ? `INJECTED:${reason}` : null, now);
    },

    async resend(tenantId, documentId) {
      const document = await repo.findDocumentById(tenantId, documentId);
      if (!document) return null;
      const rule = findTransition({ from: document.status, event: 'resend' });
      if (!rule) return null;
      const outcome = await applyRule(document, rule, null, null, clock.now());
      if (!outcome) return null;
      /*
       * Yeniden gönderimde senaryo GÖNDERİM adımından devam eder: belge zaten
       * imzalı (PROCESSING'e döndü), baştan imzalanmaz. MimForge'da da resend
       * aynı imzalı XML'i yeni zarf-UUID ile tekrar gönderir.
       */
      const scenario = scenarioOf(document.scenario);
      const submitIndex = scenario.steps.findIndex((step) => step.event === 'submit');
      const refreshed = await repo.findDocumentById(tenantId, documentId);
      if (refreshed) await scheduleStep(refreshed, scenario, submitIndex < 0 ? 0 : submitIndex);
      return outcome;
    },

    start(intervalMs) {
      if (timer) return;
      timer = setInterval(() => {
        void this.tick().catch(() => undefined);
      }, intervalMs);
      timer.unref?.();
    },

    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
