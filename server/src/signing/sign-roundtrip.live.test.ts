/**
 * 🔴 EN KRİTİK İMZA ÖLÇÜMÜ: imza belgeyi BOZUYOR MU?
 *
 * İmza `ext:UBLExtensions`'ı kökün ilk elemanı olarak ekler. UBL XSD element
 * sırası katıdır; yanlış yer belgeyi düşürür. Bu test imzalı belgeyi CANLI
 * doğrulayıcıya geri sorar — mock'un kendi ürettiği belge kendi kapısından
 * geçmezse sandbox geliştiriciye yalan söylüyor demektir.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SignedXml } from 'xml-crypto';
import { signUbl, testCertificateInfo } from './sign.js';
import { createValidator } from '../kittest/validate.js';
import { startTestApp, testMimkitEnv, LIVE_REQUIRED, type TestApp } from '../test-support.js';
import { SEED_TENANT_API_KEY } from '../seed.js';

const FIXTURE = join(
  import.meta.dirname,
  '../__fixtures__/fidelity/accept/EFATURA-01-temel-satis.xml',
);
const liveEnv = testMimkitEnv();

describe('imzalı belge canlı doğrulayıcıdan geçer', () => {
  it('mimkit bağlı', () => {
    expect(liveEnv, `${LIVE_REQUIRED}`).toBeTruthy();
  });

  it('🔑 imza belgeyi BOZMUYOR — imzalı UBL şema+şematrondan geçiyor', async () => {
    const validator = createValidator({
      url: liveEnv!.MIMMOCK_MIMKIT_URL,
      token: liveEnv!.MIMMOCK_MIMKIT_TOKEN,
      timeoutMs: 30000,
    });
    const base = readFileSync(FIXTURE, 'utf8');

    // Önce imzasız hâli geçiyor olmalı (taban ölçüm).
    const before = await validator.validate(base, { type: 'efatura', profile: 'unsigned-invoice' });
    expect(
      { schema: before.validSchema, schematron: before.validSchematron },
      'taban belge zaten geçmiyor — bu testin ölçtüğü şey imza değil',
    ).toEqual({ schema: true, schematron: true });

    // Şimdi imzalı hâli.
    const { xml: signed } = signUbl(base);
    const after = await validator.validate(signed, { type: 'efatura' });

    expect(
      { schema: after.validSchema, schematron: after.validSchematron },
      `imzalı belge düştü:\nXSD: ${JSON.stringify(after.schemaErrors)}\n` +
        `Şematron: ${after.errors.map((e) => `${e.ruleId}: ${e.message}`).join(' | ')}`,
    ).toEqual({ schema: true, schematron: true });
  });
});

describe('🔴 cac:Signature beyanı — canlı ölçümle bulunan hata', () => {
  it('imzalı belge TAM XSD\'den (profilsiz) geçer', async () => {
    const validator = createValidator({
      url: liveEnv!.MIMMOCK_MIMKIT_URL,
      token: liveEnv!.MIMMOCK_MIMKIT_TOKEN,
      timeoutMs: 30000,
    });
    /*
     * Bu test container'da bulunan bir hatanın regresyonudur:
     *
     * İmzasız belge `unsigned-invoice` PROFİLİYLE doğrulanır ve o profil
     * `cac:Signature` zorunluluğunu bastırır. İmzalı belge ise TAM XSD'ye girer;
     * `cac:Signature` beyanı yoksa "AccountingSupplierParty bu konumda geçersiz"
     * ile düşer. Fikstürlerde `cac:Signature` zaten var olduğu için birim testler
     * bunu GÖRMEDİ — json2ubl-ts çıktısında yok ve hata orada ortaya çıktı.
     *
     * Bu yüzden burada bilerek `cac:Signature`'ı SÖKÜP imzalıyoruz.
     */
    const stripped = readFileSync(FIXTURE, 'utf8').replace(
      /<cac:Signature>[\s\S]*?<\/cac:Signature>/,
      '',
    );
    expect(stripped).not.toContain('<cac:Signature>');

    const { xml: signed } = signUbl(stripped);
    expect(signed, 'imzalayıcı ÖE beyanını eklemeli').toContain('<cac:Signature>');

    // PROFİLSİZ doğrulama = tam XSD.
    const verdict = await validator.validate(signed, { type: 'efatura' });
    expect(
      { schema: verdict.validSchema, schematron: verdict.validSchematron },
      `imzalı belge tam XSD'den düştü: ${JSON.stringify(verdict.schemaErrors)}`,
    ).toEqual({ schema: true, schematron: true });
  });

  it('ÖE beyanı idempotent — zaten varsa ikinci kez eklenmez', () => {
    const base = readFileSync(FIXTURE, 'utf8');
    const { xml: signed } = signUbl(base);
    const count = (signed.match(/<cac:Signature>/g) ?? []).length;
    expect(count).toBe(1);
  });

  it('ÖE kimliği SENTETİK (plan §2b kapı 4)', () => {
    const { xml: signed } = signUbl(
      readFileSync(FIXTURE, 'utf8').replace(/<cac:Signature>[\s\S]*?<\/cac:Signature>/, ''),
    );
    const block = /<cac:Signature>([\s\S]*?)<\/cac:Signature>/.exec(signed)?.[1] ?? '';
    const vkn = /schemeID="VKN">([^<]*)/.exec(block)?.[1] ?? '';
    expect(vkn, 'ÖE VKN\'si tek rakam tekrarı olmalı').toMatch(/^(\d)\1{9}$/);
    expect(block).toMatch(/DENEME/);
  });
});

describe('motor imzayı GERÇEKTEN uyguluyor (uçtan uca)', () => {
  let ctx: TestApp;
  beforeAll(async () => {
    ctx = await startTestApp({ env: { ...liveEnv } });
  });
  afterAll(async () => {
    await ctx?.close();
  });

  const auth = { authorization: `Bearer ${SEED_TENANT_API_KEY}` };

  it('🔑 G6 geçişi belgeye imza KOYAR, yalnız durum değiştirmez', async () => {
    const xml = readFileSync(FIXTURE, 'utf8')
      .replace(/<cbc:UUID>[^<]*<\/cbc:UUID>/, `<cbc:UUID>${randomUUID()}</cbc:UUID>`)
      .replace(/<cbc:ID>ORN\d+<\/cbc:ID>/, '<cbc:ID>ORN2026000000701</cbc:ID>');

    const created = await ctx.app.inject({
      method: 'POST',
      url: '/v1/documents/ubl',
      headers: { ...auth, 'x-company': '1111111111', 'content-type': 'application/xml' },
      payload: xml,
    });
    expect(created.statusCode).toBe(202);
    const id = created.json().id as string;

    // İmzadan ÖNCE: belge imzasız.
    const beforeXml = await ctx.app.inject({ method: 'GET', url: `/v1/documents/${id}/xml`, headers: auth });
    expect(beforeXml.body).not.toContain('<ds:SignatureValue>');
    expect(beforeXml.headers['x-mimmock-document-signature']).toBe('none');

    // G6: imza adımı.
    await ctx.app.inject({ method: 'POST', url: `/v1/_sandbox/documents/${id}/advance`, headers: auth });

    const read = await ctx.app.inject({ method: 'GET', url: `/v1/documents/${id}`, headers: auth });
    const doc = read.json();
    expect(doc.status).toBe('PROCESSING');
    expect(doc.signature.kind).toBe('test-certificate');
    expect(doc.signature.signedAt).toBeTruthy();
    expect(doc.signature.chainValid, '🔴 zincir KASTEN geçersiz').toBe(false);

    // İmzadan SONRA: belge imzalı ve başlık bunu söylüyor.
    const afterXml = await ctx.app.inject({ method: 'GET', url: `/v1/documents/${id}/xml`, headers: auth });
    expect(afterXml.body).toContain('<ds:SignatureValue>');
    expect(afterXml.headers['x-mimmock-document-signature']).toContain('chain-validation-fails-by-design');

    // İmza gerçekten doğrulanabilir olmalı.
    const signatureNode = /<ds:Signature[\s\S]*<\/ds:Signature>/.exec(afterXml.body)?.[0];
    const verifier = new SignedXml({ publicCert: testCertificateInfo().pem });
    verifier.loadSignature(signatureNode as string);
    expect(verifier.checkSignature(afterXml.body)).toBe(true);
  });
});
