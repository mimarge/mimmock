/**
 * TRAFİK ÜRETECİ — M8 ölçüsü (plan §9).
 *
 * Plan iki şey ölçüyor:
 *   1. *"Üretilen HER belge GERÇEK şematrondan geçmeli."*
 *   2. *"Aynı tohum aynı trafiği vermeli."*
 *
 * Birincisi özelliğin tüm değeridir (plan §5b): sahte gövde geliştiriciye hiçbir
 * şey öğretmez. İkincisi hata ayıklamanın koşuludur: "dün gördüğüm o tuhaf
 * belgeyi bir daha üret".
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestApp, testMimkitEnv, LIVE_REQUIRED, type TestApp } from '../test-support.js';
import { SEED_TENANT_API_KEY } from '../seed.js';
import { TRAFFIC_SCENARIOS } from './scenarios.js';
import { createTrafficGenerator } from './generator.js';
import { EXTERNAL_SENDERS } from './senders.js';
import { createRng, seedFrom } from './random.js';

const liveEnv = testMimkitEnv();

describe('trafik üreteci', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    expect(liveEnv, `${LIVE_REQUIRED} — trafik GERÇEK UBL üretir`).toBeTruthy();
    ctx = await startTestApp({
      env: { ...liveEnv, MIMMOCK_TRAFFIC_SEED: 'olcum-tohumu' },
    });
  });
  afterAll(async () => {
    await ctx?.close();
  });

  const auth = { authorization: `Bearer ${SEED_TENANT_API_KEY}` };

  /*
   * Her test TEMİZ durumdan başlar: veri sıfırlanır VE tohum resetlenir.
   *
   * Gerekçe canlı koşumda görüldü: üreteç deterministik olduğu için bir testin
   * ürettiği ETTN'ler sonraki testte aynen tekrar gelir ve yazma DUPLICATE
   * olarak reddedilir. Testler birbirinin kuyruğunu yiyordu.
   */
  async function freshRun(): Promise<Awaited<ReturnType<NonNullable<typeof ctx.traffic>['run']>>> {
    await ctx.app.inject({ method: 'POST', url: '/v1/_sandbox/reset', headers: auth });
    ctx.traffic!.reset();
    return ctx.traffic!.run('tn_seed');
  }

  it('🔴 M8 ÖLÇÜSÜ: üretilen HER belge canlı şematrondan geçer', async () => {
    expect(ctx.traffic, 'mimkit bağlıyken üreteç kurulmalı').toBeTruthy();

    await ctx.app.inject({ method: 'POST', url: '/v1/_sandbox/reset', headers: auth });
    ctx.traffic!.reset();
    // Katalogdaki her senaryodan en az bir tane çıkana kadar üret.
    const seen = new Set<string>();
    const failures: string[] = [];
    for (let round = 0; round < 40 && seen.size < TRAFFIC_SCENARIOS.length; round++) {
      const results = await ctx.traffic!.run('tn_seed');
      for (const result of results) {
        seen.add(result.scenario);
        if (!result.valid && !result.duplicate) {
          failures.push(`${result.scenario}: ${result.errors.join(' | ')}`);
        }
      }
    }

    expect(
      failures,
      `🔴 bazı senaryolar GERÇEK UBL üretemedi:\n${failures.join('\n')}`,
    ).toEqual([]);
    expect(seen.size, 'katalogdaki her senaryo denenmeliydi').toBe(TRAFFIC_SCENARIOS.length);
  });

  it('🔑 M8 ÖLÇÜSÜ: aynı tohum AYNI trafiği verir', async () => {
    // İki bağımsız üreteç, aynı tohum → aynı belge dizisi.
    const a = createRng(seedFrom('deneme-tohumu'));
    const b = createRng(seedFrom('deneme-tohumu'));
    const c = createRng(seedFrom('BASKA-tohum'));

    const drawA = Array.from({ length: 20 }, () => a.uuid());
    const drawB = Array.from({ length: 20 }, () => b.uuid());
    const drawC = Array.from({ length: 20 }, () => c.uuid());

    expect(drawB, 'aynı tohum farklı akış verdi').toEqual(drawA);
    expect(drawC, 'farklı tohum aynı akışı verdi').not.toEqual(drawA);
  });

  it('🔑 üreteç reset sonrası AYNI İÇERİĞİ üretir (ETTN dahil)', async () => {
    /*
     * `preview` içerik üretir ama YAZMAZ. Determinizmin gerçek testi budur:
     * `run` ile iki kez üretmek ikinci turda DUPLICATE_UUID verir — çünkü aynı
     * tohum aynı ETTN'i üretir ve aynı veritabanına iki kez yazılamaz. Bu bir
     * kusur değil, determinizmin kanıtı; ayrı bir alanla (`duplicate`) raporlanır.
     */
    ctx.traffic!.reset();
    const first = await ctx.traffic!.preview('tn_seed');
    ctx.traffic!.reset();
    const second = await ctx.traffic!.preview('tn_seed');
    expect(second).toEqual(first);
    expect(first[0]!.ettn).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab]/);
  });

  it('aynı tohumla ikinci yazma DUPLICATE olarak RAPORLANIR (sessizce yutulmaz)', async () => {
    const first = await freshRun();
    expect(first.some((r) => r.valid && !r.duplicate)).toBe(true);

    // Veriyi SİLMEDEN tohumu resetle: aynı ETTN'ler yeniden üretilir.
    ctx.traffic!.reset();
    const second = await ctx.traffic!.run('tn_seed');
    expect(second.every((r) => r.duplicate), 'ikinci tur tamamen duplicate olmalı').toBe(true);
    expect(second.every((r) => r.documentId === null)).toBe(true);
  });

  it('🔑 üretilen belge İŞARETLİ — geliştirici kendi trafiğiyle karıştırmaz', async () => {
    const results = await freshRun();
    const produced = results.find((r) => r.valid && !r.duplicate);
    expect(produced?.documentId, JSON.stringify(results)).toBeTruthy();

    const read = await ctx.app.inject({
      method: 'GET', url: `/v1/inbox/${produced!.documentId}`, headers: auth,
    });
    expect(read.statusCode).toBe(200);
    const doc = read.json();
    expect(doc.generated, 'üretilmiş trafik işaretli olmalı').toBe(true);
    expect(doc.generatedScenario).toBe(produced!.scenario);
  });

  it('🔑 gönderici mock\'ta TANIMLI DEĞİL — dışarıdan gelmiş görünür', async () => {
    const results = await freshRun();
    const produced = results.find((r) => r.valid && !r.duplicate)!;

    const company = await ctx.repo.findCompany('tn_seed', produced.sender);
    expect(company, 'gönderici şirket olarak tanımlı OLMAMALI').toBeNull();

    // Havuzdaki her gönderici için aynı kural.
    for (const sender of EXTERNAL_SENDERS) {
      expect(await ctx.repo.findCompany('tn_seed', sender.taxNumber)).toBeNull();
    }
  });

  it('üretilen belge normal gelen belge yolunu izler (iki adımlı)', async () => {
    const results = await freshRun();
    const produced = results.find((r) => r.valid && !r.duplicate)!;

    const before = await ctx.app.inject({
      method: 'GET', url: `/v1/inbox/${produced.documentId}`, headers: auth,
    });
    // 🔑 Üretilmiş de olsa iki adımlı: RECEIVED ile başlar.
    expect(before.json().status).toBe('RECEIVED');

    ctx.clock.advance(30_000);
    await ctx.engine.tick();
    const after = await ctx.app.inject({
      method: 'GET', url: `/v1/inbox/${produced.documentId}`, headers: auth,
    });
    expect(after.json().status).toBe('DELIVERED');
  });

  it('ticari senaryo yanıt bekler, düz senaryo beklemez', async () => {
    await ctx.app.inject({ method: 'POST', url: '/v1/_sandbox/reset', headers: auth });
    ctx.traffic!.reset();
    const found = new Map<string, string>();
    for (let i = 0; i < 40 && found.size < 2; i++) {
      for (const result of await ctx.traffic!.run('tn_seed')) {
        if (!result.valid || result.duplicate || found.has(result.scenario)) continue;
        if (result.scenario !== 'ticari' && result.scenario !== 'duz') continue;
        const read = await ctx.app.inject({
          method: 'GET', url: `/v1/inbox/${result.documentId}`, headers: auth,
        });
        found.set(result.scenario, read.json().replyStatus);
      }
    }
    expect(found.get('ticari'), 'ticari fatura yanıt beklemeli').toBe('AWAITING');
    expect(found.get('duz'), 'temel fatura yanıt beklememeli').toBe('NONE');
  });

  it('`_sandbox/traffic` ucu elle tetikler ve kararları döndürür', async () => {
    await ctx.app.inject({ method: 'POST', url: '/v1/_sandbox/reset', headers: auth });
    ctx.traffic!.reset();
    const response = await ctx.app.inject({
      method: 'POST', url: '/v1/_sandbox/traffic', headers: auth,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.produced + body.rejected + body.duplicate).toBeGreaterThan(0);
    expect(body.results[0]).toHaveProperty('valid');
    expect(body.stats).toHaveProperty('produced');
  });

  it('kimlikler SENTETİK (public depo kapı 4)', () => {
    for (const sender of EXTERNAL_SENDERS) {
      expect(sender.taxNumber, `${sender.name}: VKN sentetik değil`).toMatch(/^(\d)\1{9}$/);
      expect(sender.name, `${sender.name}: sentetik damga yok`).toMatch(/DENEME|ÖRNEK/);
    }
  });
});

describe('🔴 canlı şematron kapısı GERÇEKTEN kapı mı', () => {
  /**
   * Kapının kapı olduğunu göstermenin tek yolu, doğrulayıcının RET dediği bir
   * durumda belgenin yazılmadığını görmektir.
   *
   * İlk denemede "bilerek bozuk bir senaryo" yazmıştım; o senaryo json2ubl-ts'in
   * KENDİ kapısından düşüyordu ve şematrona hiç ulaşmıyordu — yani kapı yine
   * ölçülmemişti (mutasyon "SAĞIR" demeye devam etti). Doğru ölçüm, geçerli bir
   * belgeyi RET diyen bir doğrulayıcıya vermektir.
   */
  function rejectingValidator() {
    return {
      async validate() {
        return {
          validSchema: false,
          validSchematron: false,
          errors: [{ ruleId: 'OLCUM', test: 't', message: 'ölçüm için reddedildi' }],
          schemaErrors: ['ölçüm için reddedildi'],
          appliedXsd: undefined,
          appliedSchematron: undefined,
        };
      },
      async readiness() {
        return { ready: true, detail: 'stub' };
      },
    };
  }

  it('doğrulayıcı RET derse belge gelen kutusuna YAZILMAZ', async () => {
    const ctx = await startTestApp({ env: { ...liveEnv } });
    try {
      const generator = createTrafficGenerator(
        {
          handle: ctx.handle,
          repo: ctx.repo,
          engine: ctx.engine,
          clock: ctx.clock,
          validator: rejectingValidator(),
        },
        { seed: 'ret-olcumu', burst: 3 },
      );

      const results = await generator.run('tn_seed');
      expect(results.length).toBe(3);
      for (const result of results) {
        expect(result.valid, 'reddedilen belge GEÇERLİ sayıldı').toBe(false);
        expect(result.documentId, 'reddedilen belge YAZILMIŞ').toBeNull();
        expect(result.errors.join(' '), 'red sebebi raporlanmamış').toContain('ölçüm için');
      }
      expect(generator.stats()).toEqual({ produced: 0, rejected: 3 });

      const inbox = await ctx.app.inject({
        method: 'GET', url: '/v1/inbox',
        headers: { authorization: `Bearer ${SEED_TENANT_API_KEY}` },
      });
      expect(inbox.json().inbox.length, 'reddedilen belge gelen kutusuna düşmüş').toBe(0);
    } finally {
      await ctx.close();
    }
  });

  it('doğrulayıcı ERİŞİLEMEZSE de belge yazılmaz (sessiz geçiş yok)', async () => {
    const ctx = await startTestApp({ env: { ...liveEnv } });
    try {
      const generator = createTrafficGenerator(
        {
          handle: ctx.handle,
          repo: ctx.repo,
          engine: ctx.engine,
          clock: ctx.clock,
          validator: {
            async validate() {
              throw new Error('ağ düştü');
            },
            async readiness() {
              return { ready: false, detail: 'stub' };
            },
          },
        },
        { seed: 'erisilemez', burst: 2 },
      );
      const results = await generator.run('tn_seed');
      expect(results.every((r) => !r.valid && r.documentId === null)).toBe(true);
      expect(results[0]!.errors.join(' ')).toContain('erişilemedi');
    } finally {
      await ctx.close();
    }
  });
});

describe('mimkit yokken trafik', () => {
  it('🔴 üreteç HİÇ kurulmaz — sahte gövde üretilmez', async () => {
    const ctx = await startTestApp({ env: { MIMMOCK_MIMKIT_URL: 'http://127.0.0.1:9', MIMMOCK_MIMKIT_TOKEN: 'x' } });
    try {
      expect(ctx.traffic, 'doğrulayıcısız üreteç kurulmamalı').toBeNull();
      const response = await ctx.app.inject({
        method: 'POST', url: '/v1/_sandbox/traffic',
        headers: { authorization: `Bearer ${SEED_TENANT_API_KEY}` },
      });
      expect(response.statusCode).toBe(503);
      expect(response.json().reason).toContain('GERÇEK');
    } finally {
      await ctx.close();
    }
  });
});
