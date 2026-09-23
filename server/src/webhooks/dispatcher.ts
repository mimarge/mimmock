/**
 * Webhook teslimi — plan §7.
 *
 * ```
 * teslim        EN AZ BİR KEZ → tüketici idempotent olmalı
 * sıralama      GARANTİ EDİLMEZ → her olayda sequence + documentVersion
 * yeniden dene  üstel geri çekilme, ölçülü üst sınır, sonra ÖLÜ MEKTUP
 * ```
 *
 * 🔑 Kuyruk VERİTABANINDA. Motorla aynı gerekçe (plan §5a-1): container kapanıp
 * açılınca bekleyen teslimler kaybolmaz. Bellekte tutulan bir kuyruk her restart'ta
 * "teslim edilmiş gibi" davranırdı — en-az-bir-kez sözünün tam tersi.
 */
import { randomUUID } from 'node:crypto';
import { and, eq, lte, isNotNull, inArray, desc, sql } from 'drizzle-orm';
import {
  computeSignature,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  EVENT_HEADER,
  SEQUENCE_HEADER,
  DELIVERY_HEADER,
} from './signature.js';
import type { DbHandle } from '../db/client.js';
import type { Clock } from '../engine/clock.js';
import type { WebhookDeliveryRow, WebhookRow } from '../db/repo.js';

/** Olay adları — plan §7. `inbox.*` M5'te, `report.*` M6'da doğar. */
export const WEBHOOK_EVENTS = [
  'document.status_changed',
  'document.delivered',
  'document.rejected',
  'inbox.received',
  'report.status_changed',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export function isWebhookEvent(value: string): value is WebhookEvent {
  return (WEBHOOK_EVENTS as readonly string[]).includes(value);
}

/**
 * Üstel geri çekilme — "ölçülü üst sınır" (plan §7).
 * Mock ölçeği sandbox içindir: geliştirici ölü mektubu dakikalarca beklemesin,
 * ama üstel artışın ŞEKLİ görünsün.
 */
export const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 60_000, 300_000] as const;
/** Bu deneme sayısından sonra ölü mektup. */
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

export interface DispatchEvent {
  tenantId: string;
  companyId: string | null;
  event: WebhookEvent;
  documentId: string | null;
  documentVersion: number | null;
  payload: Record<string, unknown>;
}

export interface DispatcherDeps {
  handle: DbHandle;
  clock: Clock;
  fetchImpl?: typeof fetch;
  /** İstek zaman aşımı. */
  timeoutMs?: number;
}

export interface Dispatcher {
  /** Olayı eşleşen webhook'lar için kuyruğa yazar. Döndürdüğü sayı = kuyruğa giren. */
  enqueue(event: DispatchEvent): Promise<number>;
  /** Vadesi gelen teslimleri dener. */
  drain(): Promise<WebhookDeliveryRow[]>;
  /** Tek teslimi ELLE yeniden gönderir (plan §7: manuel replay). */
  replay(tenantId: string, deliveryId: string): Promise<WebhookDeliveryRow | null>;
}

export function createDispatcher(deps: DispatcherDeps): Dispatcher {
  const { handle, clock } = deps;
  const { db, tables } = handle;
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const timeoutMs = deps.timeoutMs ?? 5000;

  /** Kiracı içinde monoton sıra. Basit ve yeterli: en büyük + 1. */
  async function nextSequence(tenantId: string): Promise<number> {
    const rows = await db
      .select({ value: tables.webhook_deliveries.sequence })
      .from(tables.webhook_deliveries)
      .where(eq(tables.webhook_deliveries.tenantId, tenantId))
      .orderBy(desc(tables.webhook_deliveries.sequence))
      .limit(1);
    return (rows[0]?.value ?? 0) + 1;
  }

  function matches(hook: WebhookRow, event: DispatchEvent): boolean {
    if (!hook.active) return false;
    if (hook.companyId && event.companyId && hook.companyId !== event.companyId) return false;
    // Boş süzgeç = hepsi.
    if (hook.events.length > 0 && !hook.events.includes(event.event)) return false;
    return true;
  }

  async function attemptDelivery(delivery: WebhookDeliveryRow): Promise<WebhookDeliveryRow> {
    const hooks = await db
      .select()
      .from(tables.webhooks)
      .where(eq(tables.webhooks.id, delivery.webhookId))
      .limit(1);
    const hook = hooks[0];
    const now = clock.now();

    if (!hook) {
      const [dead] = await db
        .update(tables.webhook_deliveries)
        .set({ status: 'dead', error: 'webhook kaydı silinmiş', nextAttemptAt: null, updatedAt: now })
        .where(eq(tables.webhook_deliveries.id, delivery.id))
        .returning();
      return dead ?? delivery;
    }

    const body = JSON.stringify(delivery.payload);
    /*
     * 🔴 İmza damgası GERÇEK zamandır, sanal saat DEĞİL.
     *
     * Canlı ölçümle bulundu: `_sandbox/clock` ile 16 gün ileri atlanınca webhook
     * damgaları da ileri gitti ve gerçek bir alıcı (gerçek saatle doğrulayan
     * geliştirici sunucusu) teslimleri "stale" diye REDDETTİ.
     *
     * Ayrım şu: sanal saat belge AKIŞINI hızlandırmak içindir; tekrar penceresi
     * ise bir GÜVENLİK mekanizmasıdır ve dış dünyanın saatine göre çalışır.
     * İkisini karıştırmak, sandbox'ta üretilen her webhook'u dışarıda geçersiz
     * kılardı. Zamanlama (`nextAttemptAt`) sanal saatte kalır — orası akışın parçası.
     */
    const timestamp = String(Date.now());
    const signature = computeSignature(hook.secret, timestamp, body);
    const attempt = delivery.attempt + 1;

    let httpStatus: number | null = null;
    let error: string | null = null;
    try {
      const response = await fetchImpl(hook.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [SIGNATURE_HEADER]: signature,
          [TIMESTAMP_HEADER]: timestamp,
          [EVENT_HEADER]: delivery.eventType,
          [SEQUENCE_HEADER]: String(delivery.sequence),
          [DELIVERY_HEADER]: delivery.id,
        },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      httpStatus = response.status;
      if (!response.ok) error = `alıcı ${response.status} döndü`;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }

    if (error === null) {
      const [ok] = await db
        .update(tables.webhook_deliveries)
        .set({
          status: 'delivered',
          attempt,
          httpStatus,
          error: null,
          nextAttemptAt: null,
          deliveredAt: now,
          updatedAt: now,
        })
        .where(eq(tables.webhook_deliveries.id, delivery.id))
        .returning();
      return ok ?? delivery;
    }

    // Başarısız: ya yeniden dene ya ölü mektuba düş.
    const retryIndex = attempt - 1;
    const delay = RETRY_DELAYS_MS[retryIndex];
    const exhausted = delay === undefined;
    const [updated] = await db
      .update(tables.webhook_deliveries)
      .set({
        status: exhausted ? 'dead' : 'retrying',
        attempt,
        httpStatus,
        error,
        nextAttemptAt: exhausted ? null : new Date(now.getTime() + delay),
        updatedAt: now,
      })
      .where(eq(tables.webhook_deliveries.id, delivery.id))
      .returning();
    return updated ?? delivery;
  }

  return {
    async enqueue(event) {
      const hooks = await db
        .select()
        .from(tables.webhooks)
        .where(eq(tables.webhooks.tenantId, event.tenantId));
      const targets = hooks.filter((hook) => matches(hook, event));
      if (targets.length === 0) return 0;

      const now = clock.now();
      let sequence = await nextSequence(event.tenantId);
      for (const hook of targets) {
        await db.insert(tables.webhook_deliveries).values({
          id: `whd_${randomUUID()}`,
          tenantId: event.tenantId,
          webhookId: hook.id,
          sequence,
          eventType: event.event,
          documentId: event.documentId,
          documentVersion: event.documentVersion,
          payload: { ...event.payload, sequence },
          status: 'pending',
          attempt: 0,
          httpStatus: null,
          error: null,
          // Hemen denenmeye hazır.
          nextAttemptAt: now,
          deliveredAt: null,
        });
        sequence += 1;
      }
      return targets.length;
    },

    async drain() {
      const due = await db
        .select()
        .from(tables.webhook_deliveries)
        .where(
          and(
            inArray(tables.webhook_deliveries.status, ['pending', 'retrying']),
            isNotNull(tables.webhook_deliveries.nextAttemptAt),
            lte(tables.webhook_deliveries.nextAttemptAt, clock.now()),
          ),
        );
      const results: WebhookDeliveryRow[] = [];
      for (const delivery of due) results.push(await attemptDelivery(delivery));
      return results;
    },

    async replay(tenantId, deliveryId) {
      const rows = await db
        .select()
        .from(tables.webhook_deliveries)
        .where(
          and(
            eq(tables.webhook_deliveries.tenantId, tenantId),
            eq(tables.webhook_deliveries.id, deliveryId),
          ),
        )
        .limit(1);
      const delivery = rows[0];
      if (!delivery) return null;
      /*
       * Elle yeniden gönderme ölü mektuptan da çalışır — plan §7 bunu ayrıca
       * istiyor. Deneme sayacı SIFIRLANIR: operatör alıcıyı düzeltmiştir,
       * tükenmiş bir sayaç yüzünden tek denemede tekrar ölmesin.
       */
      const [reset] = await db
        .update(tables.webhook_deliveries)
        .set({ status: 'pending', attempt: 0, error: null, nextAttemptAt: clock.now(), updatedAt: clock.now() })
        .where(eq(tables.webhook_deliveries.id, deliveryId))
        .returning();
      return attemptDelivery(reset ?? delivery);
    },
  };
}

/** Sayaç — panel ve `/healthz` için. */
export async function deliveryStats(
  handle: DbHandle,
  tenantId: string,
): Promise<Record<string, number>> {
  const rows = await handle.db
    .select({ status: handle.tables.webhook_deliveries.status, count: sql<number>`count(*)` })
    .from(handle.tables.webhook_deliveries)
    .where(eq(handle.tables.webhook_deliveries.tenantId, tenantId))
    .groupBy(handle.tables.webhook_deliveries.status);
  const stats: Record<string, number> = {};
  for (const row of rows) stats[row.status] = Number(row.count);
  return stats;
}
