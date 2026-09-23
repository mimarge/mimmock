/**
 * mimkit YOKKEN — ağ istemez.
 *
 * Tek bağımlılık mimkit olduğu için doğrulama, numaralama ve görüntü birlikte
 * kapanır. Ölçülen: mock AYAKTA kalır, her kapalı uç sebebini söyler, belge alma
 * sessizce "geçti" demez.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startTestApp } from '../test-support.js';
import { SEED_TENANT_API_KEY } from '../seed.js';

const FIXTURE = join(import.meta.dirname, '../__fixtures__/fidelity/accept/EFATURA-01-temel-satis.xml');

describe('mimkit yokken', () => {
  it('🔴 mock AYAKTA kalır; görüntü 503 TEMPLATE_UNAVAILABLE, belge alma 503', async () => {
    const ctx = await startTestApp({ env: { MIMMOCK_MIMKIT_URL: '', MIMMOCK_MIMKIT_TOKEN: '' } });
    try {
      expect(ctx.kittestReady).toBe(false);
      const auth = { authorization: `Bearer ${SEED_TENANT_API_KEY}` };
      const xml = readFileSync(FIXTURE, 'utf8');

      // Belge ALMA kapalı — sessizce "geçti" denmez. (Önce denenir: aynı fixture sonra
      // gelen kutusuna girince çift-kayıt kapısı doğrulamadan ÖNCE 409 verirdi.)
      const created = await ctx.app.inject({
        method: 'POST', url: '/v1/documents/ubl',
        headers: { ...auth, 'x-company': '1111111111', 'content-type': 'application/xml' },
        payload: xml,
      });
      expect(created.statusCode).toBe(503);
      expect(created.json().errorCode).toBe('VALIDATOR_UNAVAILABLE');

      // Gelen kutusu enjeksiyonu mimkit istemez (ölçüldü) — görüntülenecek bir belge doğurur.
      const injected = await ctx.app.inject({
        method: 'POST', url: '/v1/_sandbox/inbox',
        headers: { ...auth, 'x-company': '2222222222', 'content-type': 'application/xml' },
        payload: xml,
      });
      expect(injected.statusCode).toBe(202);

      const pdf = await ctx.app.inject({ method: 'GET', url: `/v1/documents/${injected.json().id}/pdf`, headers: auth });
      expect(pdf.statusCode).toBe(503);
      expect(pdf.json().errorCode).toBe('TEMPLATE_UNAVAILABLE');
      expect(pdf.json().reason).toContain('MIMMOCK_MIMKIT_URL');

    } finally {
      await ctx.close();
    }
  });

  it('`MIMMOCK_ALLOW_OFFLINE` verilen ortamdan okunur (eskiden süreç ortamından okunuyordu)', async () => {
    const { loadConfig } = await import('../config.js');
    expect(loadConfig({ MIMMOCK_ALLOW_OFFLINE: '1' } as NodeJS.ProcessEnv).allowOffline).toBe(true);
    expect(loadConfig({} as NodeJS.ProcessEnv).allowOffline).toBe(false);
  });
});
