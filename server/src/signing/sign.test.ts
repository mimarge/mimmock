/**
 * TEST İMZASI — plan §1 / K9.
 *
 * İki şey aynı anda ölçülür ve ikisi de KASITLIDIR:
 *   1. imza YAPISAL olarak geçerlidir (matematiksel doğrulama geçer),
 *   2. güven ZİNCİRİ geçersizdir (sertifika kendinden imzalı).
 *
 * İkincisi bir eksiklik değil, sözleşmedir: gerçek mali mühür bir geliştiricinin
 * dizüstündeki container'a konulmaz.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { X509Certificate } from 'node:crypto';
import { SignedXml } from 'xml-crypto';
import { signUbl, hasSignature, testCertificateInfo } from './sign.js';

const FIXTURE = join(
  import.meta.dirname,
  '../__fixtures__/fidelity/accept/EFATURA-01-temel-satis.xml',
);

function baseXml(): string {
  return readFileSync(FIXTURE, 'utf8');
}

describe('test sertifikası — plan §2b kapı 3', () => {
  it('🔴 KENDİNDEN İMZALI: hiçbir zincire bağlanmaz', () => {
    const cert = new X509Certificate(testCertificateInfo().pem);
    expect(cert.subject).toBe(cert.issuer);
    expect(cert.verify(cert.publicKey), 'kendi anahtarıyla doğrulanmalı').toBe(true);
  });

  it('🔴 konu adı GERÇEK OLMADIĞINI büyük harfle söylüyor', () => {
    const cert = new X509Certificate(testCertificateInfo().pem);
    expect(cert.subject).toMatch(/TEST/);
    expect(cert.subject).toMatch(/GERCEK DEGIL|NOT A REAL/);
  });

  it('CA değil — başka sertifika imzalayamaz', () => {
    const cert = new X509Certificate(testCertificateInfo().pem);
    expect(cert.ca).toBe(false);
  });
});

describe('XAdES imzası', () => {
  it('imzasız belgeye imza ekler', () => {
    const xml = baseXml();
    expect(hasSignature(xml)).toBe(false);
    const { xml: signed } = signUbl(xml);
    expect(hasSignature(signed)).toBe(true);
  });

  it('🔑 imza MATEMATİKSEL olarak geçerli (yapı gerçek)', () => {
    const { xml: signed } = signUbl(baseXml());
    const signatureNode = /<ds:Signature[\s\S]*<\/ds:Signature>/.exec(signed)?.[0];
    expect(signatureNode, 'ds:Signature bulunamadı').toBeTruthy();

    const verifier = new SignedXml({ publicCert: testCertificateInfo().pem });
    verifier.loadSignature(signatureNode as string);
    expect(verifier.checkSignature(signed), verifier.getSignedReferences().length === 0
      ? 'hiçbir referans doğrulanmadı'
      : 'imza doğrulaması düştü').toBe(true);
  });

  it('🔴 imza BOZULURSA doğrulama düşer (bekçi gerçek)', () => {
    const { xml: signed } = signUbl(baseXml());
    // Belgenin gövdesini değiştir — digest tutmamalı.
    const tampered = signed.replace('<cbc:CopyIndicator>false', '<cbc:CopyIndicator>true');
    const signatureNode = /<ds:Signature[\s\S]*<\/ds:Signature>/.exec(tampered)?.[0];
    const verifier = new SignedXml({ publicCert: testCertificateInfo().pem });
    verifier.loadSignature(signatureNode as string);
    let valid = false;
    try {
      valid = verifier.checkSignature(tampered);
    } catch {
      valid = false;
    }
    expect(valid, 'değiştirilmiş belge geçerli görünmemeli').toBe(false);
  });

  it.each([
    ['ext:UBLExtensions (GİB-XSD: kökün İLK elemanı)', /<ext:UBLExtensions/],
    ['sig:UBLDocumentSignatures', /<sig:UBLDocumentSignatures/],
    ['sac:SignatureInformation', /<sac:SignatureInformation/],
    ['ds:SignatureValue', /<ds:SignatureValue>/],
    ['ds:X509Certificate', /<ds:X509Certificate>/],
    ['xades:QualifyingProperties', /<xades:QualifyingProperties/],
    ['xades:SigningTime', /<xades:SigningTime>/],
    ['xades:SigningCertificate', /<xades:SigningCertificate>/],
    ['xades:CertDigest', /<xades:CertDigest>/],
  ])('yapı taşır: %s', (_label, pattern) => {
    const { xml: signed } = signUbl(baseXml());
    expect(pattern.test(signed)).toBe(true);
  });

  it('imza bilgisi zincirin GEÇERSİZ olduğunu söylüyor', () => {
    const { info } = signUbl(baseXml());
    expect(info.kind).toBe('test-certificate');
    expect(info.selfSigned).toBe(true);
    expect(info.chainValid, '🔴 zincir KASTEN geçersiz').toBe(false);
    expect(info.subject).toMatch(/TEST/);
  });

  it('imza kökün ExtensionContent\'i içinde, cac:Signature ile karışmıyor', () => {
    const { xml: signed } = signUbl(baseXml());
    const extensionContent = /<ext:ExtensionContent>([\s\S]*?)<\/ext:ExtensionContent>/.exec(signed);
    expect(extensionContent?.[1]).toContain('<ds:Signature');
    // `cac:Signature` UBL'in kendi beyan elemanıdır; imza DEĞİLDİR ve dokunulmamalı.
    expect(signed).toContain('<cac:Signature>');
  });
});
