/**
 * `/v1/companies` kapıları — HER KAPI mutasyonla sınanır: bozuk girdi üretilir
 * ve kapının gerçekten kırmızıya döndüğü görülür.
 *
 * Testler sürücü matrisinde koşar: SQLite her zaman, PG `MIMMOCK_TEST_PG`
 * ayarlıysa. Aynı gövde, iki sürücü (plan M1 ölçüsü).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestApp, driverMatrix, type TestApp } from '../test-support.js';
import { SEED_TENANT_API_KEY } from '../seed.js';

const VALID_COMPANY = {
  vkn: '3333333333',
  title: 'DENEME ÜÇÜNCÜ A.Ş.',
  addressCity: 'İzmir',
  addressCountry: 'Türkiye',
  pkAliases: ['urn:mail:defaultpk@deneme3.com'],
  gbAliases: ['urn:mail:defaultgb@deneme3.com'],
  profiles: ['TEMELFATURA'],
  eInvoiceRegistered: true,
};

describe.each(driverMatrix())('companies uçları [%s]', (driverName, url) => {
  let ctx: TestApp;
  beforeAll(async () => {
    ctx = await startTestApp({ url });
  });
  afterAll(async () => {
    await ctx.close();
  });

  const auth = () => ({ authorization: `Bearer ${SEED_TENANT_API_KEY}` });

  it('her yanıt X-MimMock-Api başlığı taşır (plan §0-2)', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/healthz' });
    expect(res.headers['x-mimmock-api']).toBe('1');
  });

  it('healthz sürücüyü ve şema parmak izini söyler', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/healthz' });
    const body = res.json();
    // Durum ağdaki mimkit'e bağlıdır; bu dosya ağ istemez. Beklenti sondanın
    // KENDİ sonucundan türetilir — eskiden sabit 'ok' bekleniyordu ve test, eski
    // varsayılan adreste yerel bir servis çalıştığı için sessizce geçiyordu.
    expect(body.status).toBe(ctx.kittestReady ? 'ok' : 'degraded');
    expect(res.statusCode).toBe(ctx.kittestReady ? 200 : 503);
    expect(body.api).toBe('mimmock v1');
    // Matriste hangi sürücü isteniyorsa GERÇEKTEN o açılmış olmalı.
    // (Gevşek bir `toContain` burada sahte yeşil üretirdi.)
    expect(body.dialect).toBe(driverName);
    expect(body.schemaFingerprint).toMatch(/^[0-9a-f]{8}$/);
  });

  it('KAPI: anahtarsız istek 401 MISSING_API_KEY', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/companies' });
    expect(res.statusCode).toBe(401);
    expect(res.json().errorCode).toBe('MISSING_API_KEY');
  });

  it('KAPI: yanlış anahtar 401 INVALID_API_KEY', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/v1/companies',
      headers: { authorization: 'Bearer yanlis_anahtar' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().errorCode).toBe('INVALID_API_KEY');
  });

  it('KAPI: Bearer olmayan Authorization 401', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/v1/companies',
      headers: { authorization: SEED_TENANT_API_KEY },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().errorCode).toBe('MISSING_API_KEY');
  });

  it('tohum veri iki şirketle gelir (K13)', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/companies', headers: auth() });
    expect(res.statusCode).toBe(200);
    const vkns = res.json().companies.map((c: { vkn: string }) => c.vkn);
    expect(vkns).toEqual(['1111111111', '2222222222']);
  });

  it('şirket tanımlanır ve geri okunur (M1 ölçüsü)', async () => {
    const created = await ctx.app.inject({
      method: 'POST',
      url: '/v1/companies',
      headers: auth(),
      payload: VALID_COMPANY,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().vkn).toBe('3333333333');

    const read = await ctx.app.inject({
      method: 'GET',
      url: '/v1/companies/3333333333',
      headers: auth(),
    });
    expect(read.statusCode).toBe(200);
    const body = read.json();
    expect(body.title).toBe('DENEME ÜÇÜNCÜ A.Ş.');
    expect(body.aliases.pk).toEqual(['urn:mail:defaultpk@deneme3.com']);
    expect(body.profiles).toEqual(['TEMELFATURA']);
    expect(body.eInvoiceRegistered).toBe(true);
  });

  it('KAPI: aynı VKN ikinci kez 409 COMPANY_EXISTS', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/companies',
      headers: auth(),
      payload: VALID_COMPANY,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().errorCode).toBe('COMPANY_EXISTS');
  });

  it.each([
    ['9 hane', '999999999'],
    ['12 hane', '999999999999'],
    ['harf içeren', '11111111a1'],
    ['boş', ''],
  ])('KAPI: geçersiz VKN (%s) 400 INVALID_VKN', async (_label, vkn) => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/companies',
      headers: auth(),
      payload: { ...VALID_COMPANY, vkn },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().errorCode).toBe('INVALID_VKN');
  });

  it('KAPI: unvansız şirket 400 VALIDATION_FAILED + errors[]', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/companies',
      headers: auth(),
      payload: { ...VALID_COMPANY, vkn: '4444444444', title: '' },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.errorCode).toBe('VALIDATION_FAILED');
    expect(body.errors.map((e: { field: string }) => e.field)).toContain('title');
  });

  it('KAPI: tanınmayan ProfileID 400 UNKNOWN_PROFILE', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/v1/companies',
      headers: auth(),
      payload: { ...VALID_COMPANY, vkn: '4444444444', profiles: ['UYDURMAFATURA'] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().errorCode).toBe('UNKNOWN_PROFILE');
  });

  it('KAPI: eInvoiceRegistered eksikse 400', async () => {
    const payload: Record<string, unknown> = { ...VALID_COMPANY, vkn: '4444444444' };
    delete payload.eInvoiceRegistered;
    const res = await ctx.app.inject({
      method: 'POST', url: '/v1/companies', headers: auth(), payload,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().errorCode).toBe('VALIDATION_FAILED');
  });

  it('KAPI: olmayan şirket 404 COMPANY_NOT_FOUND', async () => {
    const res = await ctx.app.inject({
      method: 'GET', url: '/v1/companies/9999999999', headers: auth(),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().errorCode).toBe('COMPANY_NOT_FOUND');
  });

  it('KAPI: X-Company tanımsız VKN ise 404 CONTEXT (sözlük §4.2)', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/v1/companies',
      headers: { ...auth(), 'x-company': '9999999999' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().errorCode).toBe('CONTEXT');
  });

  it('KAPI: X-Company bozuk biçimliyse 400 INVALID_VKN', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/v1/companies',
      headers: { ...auth(), 'x-company': 'abc' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().errorCode).toBe('INVALID_VKN');
  });

  it('X-Company tanımlı şirketse istek geçer (K5)', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/v1/companies',
      headers: { ...auth(), 'x-company': '1111111111' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('panel token yolu kiracıyı çözer (K14)', async () => {
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/v1/companies',
      headers: { 'x-panel-token': 'local' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('KAPI: bilinmeyen uç 404 NOT_FOUND', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/yokboyle', headers: auth() });
    expect(res.statusCode).toBe(404);
    expect(res.json().errorCode).toBe('NOT_FOUND');
  });
});
