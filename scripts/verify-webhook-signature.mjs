#!/usr/bin/env node
/**
 * MimMock webhook imzası — BAĞIMSIZ doğrulayıcı.
 *
 * 🔑 Bu betik mock'un kodundan HİÇBİR ŞEY import etmez; yalnız `node:crypto`
 * kullanır. Sebebi plan §9/M4'ün ölçüsüdür: *"imza doğrulaması BAĞIMSIZ bir
 * betikle sınanır"*. Mock kendi doğrulayıcısıyla kendini doğrularsa, iki taraf
 * birlikte yanlış olabilir ve test bunu göremez.
 *
 * Aynı zamanda geliştiricinin kopyalayıp kendi diline çevirebileceği REFERANS
 * uygulamadır — sözleşme burada, düz Türkçeyle:
 *
 *   imzalanan     = <timestamp> + "." + <ham gövde>
 *   algoritma     = HMAC-SHA256(secret, imzalanan)
 *   başlıklar     = X-MimMock-Signature: v1=<hex>
 *                   X-MimMock-Timestamp: <unix ms>
 *   pencere       = ±5 dakika
 *   karşılaştırma = SABİT ZAMANLI (timingSafeEqual)
 *
 * Kullanım:
 *   node scripts/verify-webhook-signature.mjs --secret <s> --timestamp <ms> \
 *        --signature v1=<hex> --body-file <yol>
 *   ... ya da gövdeyi stdin'den verin.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';

const TOLERANCE_MS = 5 * 60 * 1000;

export function verify({ secret, timestamp, signature, body, now = Date.now() }) {
  if (!signature || !timestamp) {
    return { valid: false, reason: 'missing', detail: 'imza ya da zaman damgası yok' };
  }
  const match = /^v1=([0-9a-f]{64})$/.exec(signature);
  if (!match) return { valid: false, reason: 'malformed', detail: 'biçim v1=<64 hex> değil' };

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) {
    return { valid: false, reason: 'malformed', detail: 'zaman damgası sayı değil' };
  }
  if (Math.abs(now - sentAt) > TOLERANCE_MS) {
    return { valid: false, reason: 'stale', detail: `pencere dışında (±${TOLERANCE_MS} ms)` };
  }

  const expected = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(match[1], 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: 'mismatch', detail: 'imza eşleşmedi' };
  }
  return { valid: true };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    if (key) args[key] = argv[i + 1];
  }
  return args;
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

// Doğrudan çalıştırıldıysa CLI; import edildiyse yalnız `verify` açılır.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const args = parseArgs(process.argv.slice(2));
  const body = args['body-file'] ? readFileSync(args['body-file'], 'utf8') : readStdin();
  const result = verify({
    secret: args.secret,
    timestamp: args.timestamp,
    signature: args.signature,
    body,
    ...(args.now ? { now: Number(args.now) } : {}),
  });
  console.log(JSON.stringify(result));
  process.exit(result.valid ? 0 : 1);
}
