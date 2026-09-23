/**
 * SADAKAT TESTİ — plan §6 / K8.
 *
 * Gönderge: *"MimForge'un ingest'inin KABUL ettiği UBL'i mock da kabul etmeli;
 * REDDETTİĞİNİ mock da reddetmeli."* Bu bir uygunluk takımı DEĞİLDİR (plan §0):
 * geleceğin uyması gereken bir sözleşmeyi değil, MimForge'un BUGÜNKÜ ölçülmüş
 * davranışını göstergesi alır.
 *
 * 🔴 CANLI doğrulama gerektirir (K4). `MIMMOCK_TEST_MIMKIT_URL/_TOKEN` verilmezse bu dosya
 * ATLANMAZ — düşer. "Atlanan test = ölçülmemiş"; sessiz yeşil vermeyiz.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startTestApp, testMimkitEnv, LIVE_REQUIRED, type TestApp } from './test-support.js';
import { createValidator } from './kittest/validate.js';
import { SCHEMATRON_TYPE_BY_DOC_TYPE } from './status.js';

const ACCEPT_DIR = join(import.meta.dirname, '__fixtures__/fidelity/accept');
const acceptFiles = readdirSync(ACCEPT_DIR).filter((f) => f.endsWith('.xml'));

/** Sentetik kimlik: tek rakamın tekrarı (1111111111, 33333333333 …). */
const SYNTHETIC_TAX_ID = /^(\d)\1{9,10}$/;
const SYNTHETIC_NAME = /DENEME|ÖRNEK|ORNEK|NUMUNE|EXAMPLE/i;

const liveEnv = testMimkitEnv();

/**
 * Her fikstür KENDİ kiracısında koşar. Gerekçesi ölçümle çıktı:
 *
 *  - Korpusta aynı belge numarası iki dosyada geçiyor (`01-temel-satis` ve
 *    `99-her-alan-dolu` → `ORN2026000000001`). Tek kiracıda ikincisi
 *    `DUPLICATE_DOCNO` alır — ki bu kapının DOĞRU çalıştığının kanıtıdır,
 *    fikstürün hatası değil.
 *  - Aynı VKN (`2222222222`) bir e-Fatura fikstüründe alıcı (sicilde OLMALI),
 *    bir e-Arşiv fikstüründe alıcı (sicilde OLMAMALI). Tek kiracıda iki koşul
 *    aynı anda sağlanamaz.
 *
 * Kiracı başına kurulum, kapıları gevşetmeden korpusu koşturmanın tek dürüst yolu.
 */
async function appForFixture(file: string, xml: string): Promise<TestApp> {
  const ctx = await startTestApp({ seed: false, env: { ...liveEnv } });

  const tenantApiKey = `k_${file}`;
  await ctx.repo.insertTenant({ id: `tn_${file}`, apiKey: tenantApiKey, name: 'SADAKAT KOŞUMU' });

  const senderVkn = /schemeID="(?:VKN|TCKN)">([^<]*)/.exec(
    /<cac:AccountingSupplierParty>[\s\S]*?<\/cac:AccountingSupplierParty>/.exec(xml)?.[0] ?? '',
  )?.[1];
  const receiverVkn = /schemeID="(?:VKN|TCKN)">([^<]*)/.exec(
    /<cac:AccountingCustomerParty>[\s\S]*?<\/cac:AccountingCustomerParty>/.exec(xml)?.[0] ?? '',
  )?.[1];

  const baseCompany = {
    addressCountry: 'Türkiye',
    pkAliases: [],
    gbAliases: [],
    profiles: [],
    templateId: null,
    seriesPrefix: null,
    addressStreet: null,
    addressDistrict: null,
    addressCity: null,
    taxOffice: null,
  };

  await ctx.repo.insertCompany({
    ...baseCompany,
    id: `co_sender_${file}`,
    tenantId: `tn_${file}`,
    vkn: senderVkn ?? '1111111111',
    title: 'DENEME GÖNDERİCİ A.Ş.',
    eInvoiceRegistered: true,
  });

  // 🔑 Sicil kurulumu: e-Fatura belgesinin alıcısı sicilde OLMALI, e-Arşiv
  // belgesininki OLMAMALI. Bu ayrım MimForge'un `RECEIVER_NOT_REGISTERED` /
  // `RECEIVER_REGISTERED` çiftinin ta kendisidir (sözlük §4.2).
  const isEInvoice = file.startsWith('EFATURA-');
  if (isEInvoice && receiverVkn && receiverVkn !== senderVkn) {
    await ctx.repo.insertCompany({
      ...baseCompany,
      id: `co_receiver_${file}`,
      tenantId: `tn_${file}`,
      vkn: receiverVkn,
      title: 'DENEME ALICI LTD. ŞTİ.',
      eInvoiceRegistered: true,
    });
  }

  return { ...ctx, apiKey: tenantApiKey };
}

/**
 * 🔴 ÖLÇÜLEN DÜZELTME (2026-09-22) — beklenti ≠ ölçüm.
 *
 * Sözlük §7.1 *"`tpl-forge/samples` 28 XML, hepsi KABUL bekliyor"* diyordu. Canlı
 * doğrulayıcıya sorulduğunda v1 kapsamındaki 15 belgeden **11'i XSD'den düşüyor**
 * (`cac:Address` içinde `CityName` element sırası). Bu fikstürler GÖRÜNÜM
 * ŞABLONU (görüntü dönüşümü) testleri için üretilmiş; ingest'ten geçirildikleri hiç ölçülmemiş.
 *
 * Bu yüzden testin göstergesi dosya adı DEĞİL, **referans kararıdır**: aynı belge
 * MimForge'un kullandığı parametrelerle doğrudan doğrulayıcıya sorulur, sonra
 * mock'a verilir. İki karar AYNI olmalı. Plan §6'nın lafzı da budur:
 * *"kabul ettiğini kabul, reddettiğini ret"* — "hepsini kabul" değil.
 *
 * Bu kuruluş "bedava büyür" özelliğini korur: korpusa yeni belge girdiğinde
 * beklentisini kimsenin elle yazması gerekmez.
 */
describe('sadakat: mock ile referans doğrulayıcı AYNI kararı vermeli', () => {
  it('mimkit bağlı olmadan bu blok ÖLÇÜLMÜŞ sayılmaz', () => {
    expect(
      liveEnv,
      `${LIVE_REQUIRED} — sadakat testi CANLI doğrulama ister (plan K4). ` +
        'Bu test atlanmaz; ölçülmeden yeşil sayılmaz.',
    ).toBeTruthy();
  });

  it.each(acceptFiles)('%s: mock kararı = referans kararı', async (file) => {
    const xml = readFileSync(join(ACCEPT_DIR, file), 'utf8').replace(
      /<cbc:UUID>[^<]*<\/cbc:UUID>/,
      `<cbc:UUID>${randomUUID()}</cbc:UUID>`,
    );

    // 1) Referans karar — MimForge'un göndereceği tip/profil ile doğrudan servise.
    const reference = createValidator({
      url: liveEnv!.MIMMOCK_MIMKIT_URL,
      token: liveEnv!.MIMMOCK_MIMKIT_TOKEN,
      timeoutMs: 30000,
    });
    const docType = file.startsWith('EARSIV-') ? 'EARSIV' : 'EFATURA';
    const referenceResult = await reference.validate(xml, {
      type: SCHEMATRON_TYPE_BY_DOC_TYPE[docType],
      profile: 'unsigned-invoice',
    });
    const referenceAccepts = referenceResult.validSchema && referenceResult.validSchematron;

    // 2) Mock kararı.
    const ctx = await appForFixture(file, xml);
    try {
      expect(ctx.kittestReady, 'mimkit hazır değil — ölçüm yapılamaz').toBe(true);
      const senderVkn = /schemeID="(?:VKN|TCKN)">([^<]*)/.exec(
        /<cac:AccountingSupplierParty>[\s\S]*?<\/cac:AccountingSupplierParty>/.exec(xml)?.[0] ?? '',
      )?.[1];

      const response = await ctx.app.inject({
        method: 'POST',
        url: '/v1/documents/ubl',
        headers: {
          authorization: `Bearer ${ctx.apiKey}`,
          'x-company': senderVkn ?? '1111111111',
          'content-type': 'application/xml',
        },
        payload: xml,
      });
      const body = response.json();

      if (referenceAccepts) {
        if (response.statusCode !== 202) {
          throw new Error(
            `SAPMA: referans KABUL etti, mock ${response.statusCode} ${body.errorCode} ` +
              `(${body.reason}) döndü.`,
          );
        }
      } else {
        // Referans reddetti → mock da reddetmeli, hem de AYNI eksenden (şema).
        if (response.statusCode !== 400 || body.errorCode !== 'SCHEMA_INVALID') {
          throw new Error(
            `SAPMA: referans REDDETTİ (schema=${referenceResult.validSchema}, ` +
              `schematron=${referenceResult.validSchematron}) ama mock ` +
              `${response.statusCode} ${body.errorCode ?? 'KABUL'} döndü.`,
          );
        }
      }
      expect(true).toBe(true);
    } finally {
      await ctx.close();
    }
  });

  it('korpusun kaçının referanstan geçtiği KAYDA GEÇER', async () => {
    const reference = createValidator({
      url: liveEnv!.MIMMOCK_MIMKIT_URL,
      token: liveEnv!.MIMMOCK_MIMKIT_TOKEN,
      timeoutMs: 30000,
    });
    const verdicts: Record<string, boolean> = {};
    for (const file of acceptFiles) {
      const xml = readFileSync(join(ACCEPT_DIR, file), 'utf8');
      const docType = file.startsWith('EARSIV-') ? 'EARSIV' : 'EFATURA';
      const r = await reference.validate(xml, {
        type: SCHEMATRON_TYPE_BY_DOC_TYPE[docType],
        profile: 'unsigned-invoice',
      });
      verdicts[file] = r.validSchema && r.validSchematron;
    }
    const accepted = Object.values(verdicts).filter(Boolean).length;
    // 🔴 Bu sayı bir HEDEF değil, ÖLÇÜM. Değişirse korpus ya da doğrulayıcı
    // değişmiş demektir ve fark görülmelidir — sessiz kaymaya izin yok.
    expect(
      { accepted, total: acceptFiles.length, verdicts },
      'korpusun referans kararı değişti — docs/m2-olcum.md güncellenmeli',
    ).toEqual({
      accepted: 4,
      total: 15,
      verdicts: {
        'EARSIV-01-kurumsal-satis.xml': false,
        'EARSIV-02-internet-satis.xml': false,
        'EARSIV-03-tevkifatli.xml': false,
        'EARSIV-04-doviz-istisna.xml': false,
        'EARSIV-05-ytb-iade.xml': false,
        'EARSIV-06-hks-komisyoncu.xml': true,
        'EARSIV-99-her-alan-dolu.xml': false,
        'EFATURA-01-temel-satis.xml': true,
        'EFATURA-02-tevkifatli.xml': false,
        'EFATURA-03-ihracat.xml': false,
        'EFATURA-04-yolcu-beraber.xml': false,
        'EFATURA-05-iade.xml': false,
        'EFATURA-06-hks-komisyoncu.xml': true,
        'EFATURA-07-belge-artirim.xml': true,
        'EFATURA-99-her-alan-dolu.xml': false,
      },
    });
  });
});
