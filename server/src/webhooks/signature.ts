/**
 * Webhook imzası — plan §7.
 *
 * ```
 * imza          HMAC-SHA256(secret, timestamp + "." + body)
 * başlıklar     X-MimMock-Signature · X-MimMock-Timestamp
 * tekrar penc.  ±5 dk (ayarlanabilir)
 * ```
 *
 * İmzalanan şey **zaman damgası + nokta + gövde**dir; yalnız gövde değil. Aradaki
 * fark bir tekrar (replay) saldırısını mümkün/imkânsız kılar: damga imzanın içinde
 * olmazsa saldırgan eski bir gövdeyi eski imzasıyla sonsuza dek tekrar gönderebilir.
 *
 * 🔑 Karşılaştırma SABİT ZAMANLI yapılır (`timingSafeEqual`). Düz `===` ile
 * karşılaştıran bir doğrulayıcı, imzayı bayt bayt tahmin etmeye açık kalır —
 * geliştiricinin kopyalayacağı örnek kod bu yüzden doğru olmalı.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_HEADER = 'x-mimmock-signature';
export const TIMESTAMP_HEADER = 'x-mimmock-timestamp';
export const EVENT_HEADER = 'x-mimmock-event';
export const SEQUENCE_HEADER = 'x-mimmock-sequence';
export const DELIVERY_HEADER = 'x-mimmock-delivery';

/** Varsayılan tekrar penceresi: ±5 dakika (plan §7). */
export const DEFAULT_TOLERANCE_MS = 5 * 60 * 1000;

/** `v1=<hex>` — sürümlü önek, ileride algoritma değişirse kırılmadan geçilsin. */
export function computeSignature(secret: string, timestamp: string, body: string): string {
  const mac = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `v1=${mac}`;
}

export interface VerifyInput {
  secret: string;
  signature: string | undefined;
  timestamp: string | undefined;
  body: string;
  /** Doğrulama anı; verilmezse şimdi. */
  now?: Date;
  toleranceMs?: number;
}

export type VerifyResult =
  | { valid: true }
  | { valid: false; reason: 'missing' | 'malformed' | 'stale' | 'mismatch'; detail: string };

export function verifySignature(input: VerifyInput): VerifyResult {
  const { secret, signature, timestamp, body } = input;
  if (!signature || !timestamp) {
    return { valid: false, reason: 'missing', detail: 'İmza ya da zaman damgası başlığı yok.' };
  }
  if (!/^v1=[0-9a-f]{64}$/.test(signature)) {
    return { valid: false, reason: 'malformed', detail: 'İmza biçimi `v1=<64 hex>` değil.' };
  }

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) {
    return { valid: false, reason: 'malformed', detail: 'Zaman damgası sayı değil (ms).' };
  }

  const tolerance = input.toleranceMs ?? DEFAULT_TOLERANCE_MS;
  const now = (input.now ?? new Date()).getTime();
  if (Math.abs(now - sentAt) > tolerance) {
    return {
      valid: false,
      reason: 'stale',
      detail: `Zaman damgası pencere dışında (±${tolerance} ms).`,
    };
  }

  const expected = computeSignature(secret, timestamp, body);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: 'mismatch', detail: 'İmza eşleşmedi.' };
  }
  return { valid: true };
}
