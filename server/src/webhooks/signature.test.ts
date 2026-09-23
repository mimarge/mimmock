/**
 * Webhook imzası — plan §7 sözleşmesinin bekçisi.
 * Her kapı BOZUK girdiyle sınanır; imza doğrulaması sessizce gevşerse geliştirici
 * sahte bir güvenlik duygusuyla üretime çıkar.
 */
import { describe, it, expect } from 'vitest';
import { computeSignature, verifySignature, DEFAULT_TOLERANCE_MS } from './signature.js';

const SECRET = 'whsec_deneme';
const BODY = JSON.stringify({ event: 'document.delivered', sequence: 7 });

function signedNow(now = new Date()) {
  const timestamp = String(now.getTime());
  return { timestamp, signature: computeSignature(SECRET, timestamp, BODY), now };
}

describe('webhook imzası', () => {
  it('imza `v1=<64 hex>` biçiminde', () => {
    const { signature } = signedNow();
    expect(signature).toMatch(/^v1=[0-9a-f]{64}$/);
  });

  it('🔑 zaman damgası İMZANIN İÇİNDE — damga değişince imza değişir', () => {
    const a = computeSignature(SECRET, '1000', BODY);
    const b = computeSignature(SECRET, '2000', BODY);
    expect(a).not.toBe(b);
  });

  it('geçerli imza doğrulanır', () => {
    const { timestamp, signature, now } = signedNow();
    expect(verifySignature({ secret: SECRET, signature, timestamp, body: BODY, now })).toEqual({
      valid: true,
    });
  });

  it('KAPI: başlık yoksa reddedilir', () => {
    const r = verifySignature({ secret: SECRET, signature: undefined, timestamp: '1', body: BODY });
    expect(r).toMatchObject({ valid: false, reason: 'missing' });
  });

  it.each([['boş', ''], ['öneksiz', 'abc'], ['kısa hex', 'v1=dead'], ['büyük harf', `v1=${'A'.repeat(64)}`]])(
    'KAPI: bozuk imza biçimi (%s) reddedilir',
    (_label, signature) => {
      const r = verifySignature({ secret: SECRET, signature, timestamp: '1000', body: BODY });
      expect(r).toMatchObject({ valid: false });
    },
  );

  it('KAPI: yanlış gizli anahtar → mismatch', () => {
    const { timestamp, signature, now } = signedNow();
    const r = verifySignature({ secret: 'baska_anahtar', signature, timestamp, body: BODY, now });
    expect(r).toMatchObject({ valid: false, reason: 'mismatch' });
  });

  it('KAPI: gövde değiştirilirse → mismatch', () => {
    const { timestamp, signature, now } = signedNow();
    const r = verifySignature({
      secret: SECRET,
      signature,
      timestamp,
      body: BODY.replace('7', '8'),
      now,
    });
    expect(r).toMatchObject({ valid: false, reason: 'mismatch' });
  });

  it('🔑 KAPI: tekrar penceresi dışı (±5 dk) → stale', () => {
    const past = new Date(Date.now() - DEFAULT_TOLERANCE_MS - 1000);
    const timestamp = String(past.getTime());
    const signature = computeSignature(SECRET, timestamp, BODY);
    const r = verifySignature({ secret: SECRET, signature, timestamp, body: BODY });
    expect(r).toMatchObject({ valid: false, reason: 'stale' });
  });

  it('pencere İÇİNDE eski damga kabul edilir', () => {
    const past = new Date(Date.now() - DEFAULT_TOLERANCE_MS + 5000);
    const timestamp = String(past.getTime());
    const signature = computeSignature(SECRET, timestamp, BODY);
    expect(verifySignature({ secret: SECRET, signature, timestamp, body: BODY }).valid).toBe(true);
  });

  it('GELECEKTEKİ damga da pencere dışındaysa reddedilir (saat kayması)', () => {
    const future = new Date(Date.now() + DEFAULT_TOLERANCE_MS + 1000);
    const timestamp = String(future.getTime());
    const signature = computeSignature(SECRET, timestamp, BODY);
    expect(verifySignature({ secret: SECRET, signature, timestamp, body: BODY })).toMatchObject({
      valid: false,
      reason: 'stale',
    });
  });
});
