/**
 * Numaratör — CANLI ölçüm (plan K4/K6).
 *
 * `MIMMOCK_TEST_MIMKIT_URL` + `..._TOKEN` verilmezse ATLANMAZ, DÜŞER.
 * Ölçülen sözleşme: `docs/m2-olcum-kittest-sozlesmesi.md` §2.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createNumbers, NumberingRejectedError, type Numbers } from './numbers.js';

const url = process.env.MIMMOCK_TEST_MIMKIT_URL;
const token = process.env.MIMMOCK_TEST_MIMKIT_TOKEN;
/** Her koşum kendi kapsamında çalışır; başka koşumun serisini kirletmesin. */
const SCOPE = `mimmock-test-${process.env.MIMMOCK_TEST_SCOPE ?? 'local'}`;
const OWNER = '1111111111';

describe('numaratör (canlı)', () => {
  let numbers: Numbers;

  beforeAll(() => {
    expect(url, 'MIMMOCK_TEST_MIMKIT_URL verilmedi — numaratör ölçülmeden yeşil sayılmaz').toBeTruthy();
    expect(token, 'MIMMOCK_TEST_MIMKIT_TOKEN verilmedi').toBeTruthy();
    numbers = createNumbers({
      url: url as string,
      token: token as string,
      scopeId: SCOPE,
      timeoutMs: 15000,
    });
  });

  it('servis ayakta', async () => {
    expect(await numbers.health()).toBe(true);
  });

  it('KAPI: scope zorunlu — eksikse servis reddeder', async () => {
    // Scope'u boş geçen ham bir istek: sözleşmenin ölçülmüş kapısı (SCOPE_REQUIRED).
    const response = await fetch(`${(url as string).replace(/\/+$/, '')}/v1/numbers/reserve`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json',
        'content-type': 'application/json',
        'x-owner-tax-id': OWNER,
        'idempotency-key': randomUUID(),
      },
      body: JSON.stringify({ date: '2026-04-24', docType: 'EFATURA' }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('SCOPE_REQUIRED');
  });

  it('önekten seri kimliği çözülür; seri yoksa AÇILIR (K-N7 deseni)', async () => {
    const seriesId = await numbers.resolveSeriesId({
      ownerTaxId: OWNER,
      prefix: 'MMT',
      docType: 'EFATURA',
    });
    expect(seriesId).toMatch(/^ser_/);
    // İkinci çağrı aynı kimliği vermeli (önbellek + liste eşleşmesi).
    const again = await numbers.resolveSeriesId({
      ownerTaxId: OWNER,
      prefix: 'MMT',
      docType: 'EFATURA',
    });
    expect(again).toBe(seriesId);
  });

  it('🔑 rezerve edilen numara MimForge belge-no biçimine uyar', async () => {
    const seriesId = await numbers.resolveSeriesId({
      ownerTaxId: OWNER,
      prefix: 'MMT',
      docType: 'EFATURA',
    });
    const reservation = await numbers.reserve({
      idempotencyKey: randomUUID(),
      date: '2026-04-24',
      ownerTaxId: OWNER,
      seriesId,
    });
    // `DOCNO_FORMAT_RE` — MimForge `routes.documents.ts:172` ile birebir.
    expect(reservation.number).toMatch(/^[A-Z0-9]{3}20\d{2}\d{9}$/);
    expect(reservation.number.slice(0, 3)).toBe('MMT');
    expect(reservation.number.slice(3, 7)).toBe('2026');
    expect(reservation.replayed).toBe(false);
  });

  it('🔴 aynı idempotency-key MÜKERRER NUMARA YAKMAZ', async () => {
    const seriesId = await numbers.resolveSeriesId({
      ownerTaxId: OWNER,
      prefix: 'MMT',
      docType: 'EFATURA',
    });
    const key = randomUUID();
    const input = { idempotencyKey: key, date: '2026-04-24', ownerTaxId: OWNER, seriesId };

    const first = await numbers.reserve(input);
    const second = await numbers.reserve(input);

    expect(second.number).toBe(first.number);
    expect(second.replayed).toBe(true);
  });

  it('yeni anahtar sırayı ilerletir', async () => {
    const seriesId = await numbers.resolveSeriesId({
      ownerTaxId: OWNER,
      prefix: 'MMT',
      docType: 'EFATURA',
    });
    const a = await numbers.reserve({
      idempotencyKey: randomUUID(), date: '2026-04-24', ownerTaxId: OWNER, seriesId,
    });
    const b = await numbers.reserve({
      idempotencyKey: randomUUID(), date: '2026-04-24', ownerTaxId: OWNER, seriesId,
    });
    expect(b.number).not.toBe(a.number);
  });

  it('KAPI: bilinmeyen seri kimliği reddedilir', async () => {
    await expect(
      numbers.reserve({
        idempotencyKey: randomUUID(),
        date: '2026-04-24',
        ownerTaxId: OWNER,
        seriesId: 'ser_YOKBOYLEBIRSERI00000000000',
      }),
    ).rejects.toBeInstanceOf(NumberingRejectedError);
  });
});
