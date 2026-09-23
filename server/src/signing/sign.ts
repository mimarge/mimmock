/**
 * TEST İMZASI — plan §1 / K9.
 *
 * 🔴 BU GERÇEK BİR MALİ MÜHÜR DEĞİLDİR VE OLAMAZ.
 *
 * Gerçek ÖE mali mührü bir geliştiricinin dizüstündeki container'a KONULMAZ.
 * Mock, gömülü bir test sertifikasıyla **yapısal olarak geçerli XAdES** üretir:
 *   - ayrıştırıcınız çalışır,
 *   - imza yapısı (`ds:Signature` + `xades:QualifyingProperties`) gerçektir,
 *   - **zincir doğrulaması KASTEN başarısız olur** (sertifika kendinden imzalı).
 *
 * İmza zinciri doğrulaması yazan geliştirici bunu görünce "mock bozuk" sanmamalı:
 * `GET /v1/documents/:id/xml` yanıtı `X-MimMock-Signature: test-certificate`
 * başlığı taşır ve panelde her belgenin yanında TEST İMZASI rozeti vardır.
 *
 * ⚠️ Plan §2c bu alanı RİSK ALANI diye işaretledi (XAdES kılçıklıdır). Hedef
 * *yapısal* geçerliliktir; imza ALGORİTMASI gerçek, GÜVEN ZİNCİRİ sahtedir.
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SignedXml } from 'xml-crypto';

const CERT_DIR = join(import.meta.dirname, 'test-cert');

/** UBL-TR ad alanları — ÖLÇÜLDÜ: `mimforge/packages/sign/src/prepare.ts:64,125-128`. */
const EXT_NS = 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2';
const SIG_NS = 'urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2';
const SAC_NS = 'urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2';
const XADES_NS = 'http://uri.etsi.org/01903/v1.3.2#';

export interface TestSignature {
  /** İmzalanmış UBL. */
  xml: string;
  /** İmza yapısının özeti — panel ve `/xml` başlığı için. */
  info: SignatureInfo;
}

export interface SignatureInfo {
  /** Her zaman `test-certificate`. Gerçek mühür asla üretilmez. */
  kind: 'test-certificate';
  /** Sertifikanın konusu — TEST damgası burada görünür. */
  subject: string;
  /** Kendinden imzalı mı (her zaman true). */
  selfSigned: true;
  /** 🔴 Zincir doğrulaması geçer mi — her zaman false, KASTEN. */
  chainValid: false;
  signedAt: string;
  digestAlgorithm: string;
  signatureAlgorithm: string;
}

let cached: { key: string; cert: string; certB64: string; subject: string } | null = null;

function loadCertificate(): NonNullable<typeof cached> {
  if (cached) return cached;
  const key = readFileSync(join(CERT_DIR, 'test-key.pem'), 'utf8');
  const cert = readFileSync(join(CERT_DIR, 'test-cert.pem'), 'utf8');
  const certB64 = cert
    .replace(/-----BEGIN CERTIFICATE-----/, '')
    .replace(/-----END CERTIFICATE-----/, '')
    .replace(/\s+/g, '');
  // Konu satırını PEM'den değil, sabit metinden okumak yanıltıcı olurdu; sertifika
  // değişirse damga da değişmeli. Bu yüzden DER'den çıkarılır.
  const subject = extractSubjectCommonName(certB64);
  cached = { key, cert, certB64, subject };
  return cached;
}

/** DER içindeki son UTF8String/PrintableString — CN'i yakalamak için yeterli. */
function extractSubjectCommonName(certB64: string): string {
  const der = Buffer.from(certB64, 'base64');
  const text = der.toString('latin1');
  const match = /MIMMOCK[ -~]*?GERCEK DEGIL/.exec(text);
  return match?.[0] ?? 'MIMMOCK TEST SERTIFIKASI';
}

/**
 * İmza KABINI kökün hemen içine yerleştirir (GİB-XSD sırası: `ext:UBLExtensions`
 * kökün İLK elemanıdır — ölçüldü, `mimforge/packages/sign/src/prepare.ts:108-128`).
 *
 * 🔴 Kap imzadan ÖNCE kurulmalıdır. İlk kurulumda sarmalayıcılar imzadan SONRA
 * ekleniyordu ve digest bozuluyordu: enveloped imza tüm belgeyi özetler, imzadan
 * sonra belgeye eklenen her düğüm o özeti geçersiz kılar. Testte "hiçbir referans
 * doğrulanmadı" diye görüldü.
 */
function ensureSignatureContainer(xml: string): string {
  const inner =
    `<sig:UBLDocumentSignatures xmlns:sig="${SIG_NS}" xmlns:sac="${SAC_NS}">` +
    `<sac:SignatureInformation></sac:SignatureInformation>` +
    `</sig:UBLDocumentSignatures>`;

  // Belgede zaten UBLExtensions varsa kabı onun ExtensionContent'ine koy.
  if (/<(?:[A-Za-z0-9]+:)?UBLExtensions[\s/>]/.test(xml)) {
    if (/<(?:[A-Za-z0-9]+:)?UBLDocumentSignatures[\s/>]/.test(xml)) return xml;
    return xml.replace(
      /(<((?:[A-Za-z0-9]+:)?)ExtensionContent>)/,
      (_m, open: string) => `${open}${inner}`,
    );
  }

  const rootOpen = /<((?:[A-Za-z0-9_.-]+:)?(?:Invoice|CreditNote|DespatchAdvice|ApplicationResponse))(\s[^>]*)?>/.exec(
    xml,
  );
  if (!rootOpen) throw new Error('UBL kökü bulunamadı; imza yerleştirilemez.');
  const at = rootOpen.index + rootOpen[0].length;
  const container =
    `\n  <ext:UBLExtensions xmlns:ext="${EXT_NS}">` +
    `<ext:UBLExtension><ext:ExtensionContent>${inner}</ext:ExtensionContent></ext:UBLExtension>` +
    `</ext:UBLExtensions>`;
  return xml.slice(0, at) + container + xml.slice(at);
}

/**
 * XAdES `QualifyingProperties` — elle kurulur (plan §2c).
 * `SigningCertificate` özeti gerçek sertifikanın SHA-256'sıdır; yani yapı doğru,
 * güven zinciri yok.
 */
function qualifyingProperties(
  signatureId: string,
  certB64: string,
  signedAt: string,
  subject: string,
): string {
  const certDigest = createHash('sha256').update(Buffer.from(certB64, 'base64')).digest('base64');
  return (
    `<xades:QualifyingProperties xmlns:xades="${XADES_NS}" Target="#${signatureId}">` +
    `<xades:SignedProperties Id="${signatureId}-signedprops">` +
    `<xades:SignedSignatureProperties>` +
    `<xades:SigningTime>${signedAt}</xades:SigningTime>` +
    `<xades:SigningCertificate><xades:Cert>` +
    `<xades:CertDigest>` +
    `<ds:DigestMethod xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>` +
    `<ds:DigestValue xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${certDigest}</ds:DigestValue>` +
    `</xades:CertDigest>` +
    `<xades:IssuerSerial>` +
    `<ds:X509IssuerName xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${subject}</ds:X509IssuerName>` +
    `<ds:X509SerialNumber xmlns:ds="http://www.w3.org/2000/09/xmldsig#">1</ds:X509SerialNumber>` +
    `</xades:IssuerSerial>` +
    `</xades:Cert></xades:SigningCertificate>` +
    `</xades:SignedSignatureProperties>` +
    `</xades:SignedProperties>` +
    `</xades:QualifyingProperties>`
  );
}

/**
 * ÖE beyan tarafı — mock'un "özel entegratör" kimliği.
 * 🔴 Kimlik SENTETİK: VKN tek rakam tekrarı, unvan DENEME damgalı (plan §2b kapı 4).
 */
const MOCK_OE = {
  vkn: '9999999999',
  title: 'DENEME MIMMOCK OZEL ENTEGRATOR A.S.',
  taxOffice: 'DENEME VERGI DAIRESI',
  city: 'Ankara',
  /** ⚠️ UBL-TR'de `CitySubdivisionName` ZORUNLU — atlanırsa CityName "bu konumda
   *  geçersiz" der. Canlı doğrulayıcıyla ölçüldü. */
  citySubdivision: 'Çankaya',
  country: 'Türkiye',
  street: 'Deneme Mahallesi Sandbox Sokak',
  buildingNumber: '1',
  postalZone: '06000',
} as const;

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * `cac:Signature` BEYAN elemanını ekler — ÖLÇÜLDÜ: `mimforge/packages/sign/src/prepare.ts:188-205`.
 *
 * 🔴 Bu, `ext:UBLExtensions` içindeki XAdES `ds:Signature`'dan AYRI bir gövde
 * elemanıdır: imzalayan tarafı (ÖE) BEYAN eder, kriptografik imza değildir.
 *
 * Neden gerekli (canlı ölçümle bulundu): imzasız belge `unsigned-invoice`
 * profiliyle doğrulanır ve o profil `cac:Signature` zorunluluğunu BASTIRIR.
 * İmzalı belge ise tam XSD'ye girer — `cac:Signature` yoksa
 * *"AccountingSupplierParty bu konumda geçersiz"* ile düşer. Mock bunu eklemeseydi
 * kendi imzaladığı belgeyi kendi doğrulayıcısından geçiremezdi.
 *
 * UBL sırası: gönderici party'den HEMEN ÖNCE. Minimal blok XSD'den geçmez;
 * zengin blok (PostalAddress + PartyTaxScheme + DigitalSignatureAttachment) şart.
 * Idempotent: gövde beyanı zaten varsa dokunmaz.
 */
function ensureCacSignature(xml: string): string {
  // `ext:ExtensionContent` içindeki `ds:Signature`'ı `cac:Signature` SANMAZ.
  if (/<(?:[A-Za-z0-9_.-]+:)?Signature>/.test(xml.replace(/<ext:UBLExtensions[\s\S]*?<\/ext:UBLExtensions>/g, ''))) {
    return xml;
  }
  const anchor =
    /<(?:[A-Za-z0-9_.-]+:)?(?:AccountingSupplierParty|DespatchSupplierParty|SenderParty)[\s>]/.exec(xml);
  if (!anchor) return xml; // gönderici party yok → güvenli no-op

  const block =
    `<cac:Signature>` +
    `<cbc:ID schemeID="VKN_TCKN">${esc(MOCK_OE.vkn)}</cbc:ID>` +
    `<cac:SignatoryParty>` +
    `<cbc:WebsiteURI/>` +
    `<cac:PartyIdentification><cbc:ID schemeID="VKN">${esc(MOCK_OE.vkn)}</cbc:ID></cac:PartyIdentification>` +
    `<cac:PartyName><cbc:Name>${esc(MOCK_OE.title)}</cbc:Name></cac:PartyName>` +
    // Alan SIRASI UBL-TR AddressType ile birebir; kanıt: `tpl-forge` fikstürünün
    // doğrulayıcıdan geçen `cac:Signature/SignatoryParty/PostalAddress` bloğu.
    `<cac:PostalAddress>` +
    `<cbc:StreetName>${esc(MOCK_OE.street)}</cbc:StreetName>` +
    `<cbc:BuildingNumber>${esc(MOCK_OE.buildingNumber)}</cbc:BuildingNumber>` +
    `<cbc:CitySubdivisionName>${esc(MOCK_OE.citySubdivision)}</cbc:CitySubdivisionName>` +
    `<cbc:CityName>${esc(MOCK_OE.city)}</cbc:CityName>` +
    `<cbc:PostalZone>${esc(MOCK_OE.postalZone)}</cbc:PostalZone>` +
    `<cac:Country><cbc:Name>${esc(MOCK_OE.country)}</cbc:Name></cac:Country>` +
    `</cac:PostalAddress>` +
    `<cac:PartyTaxScheme><cac:TaxScheme><cbc:Name>${esc(MOCK_OE.taxOffice)}</cbc:Name></cac:TaxScheme></cac:PartyTaxScheme>` +
    `</cac:SignatoryParty>` +
    `<cac:DigitalSignatureAttachment><cac:ExternalReference><cbc:URI/></cac:ExternalReference></cac:DigitalSignatureAttachment>` +
    `</cac:Signature>`;

  return xml.slice(0, anchor.index) + block + xml.slice(anchor.index);
}

export function signUbl(xmlInput: string): TestSignature {
  const { key, certB64, subject } = loadCertificate();
  // Sıra ÖNEMLİ: önce ÖE beyanı (gövde elemanı), sonra imza kabı, sonra imza.
  // İkisi de imzadan ÖNCE yerleşmeli; sonradan eklenen her düğüm özeti bozar.
  const withContainer = ensureSignatureContainer(ensureCacSignature(xmlInput));
  const signatureId = `mimmock-test-sig-${randomUUID()}`;
  const signedAt = new Date().toISOString();

  const signer = new SignedXml({
    privateKey: key,
    publicCert: `-----BEGIN CERTIFICATE-----\n${certB64}\n-----END CERTIFICATE-----`,
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
    /*
     * XAdES nitelikleri `ds:Object` olarak imzanın İÇİNE girer. xml-crypto bunu
     * kendisi yazabiliyor; elle string düzenlemek yerine buradan veriyoruz ki
     * imzalama sırasında yerinde olsun.
     */
    objects: [
      { content: qualifyingProperties(signatureId, certB64, signedAt, subject) },
    ],
  });

  /*
   * Enveloped imza: tüm belge imzalanır, imzanın kendisi dışarıda bırakılır.
   *
   * 🔴 `uri: ''` ZORUNLU. Boş bırakılırsa xml-crypto referansı bağlamak için KÖK
   * elemana `Id="_0"` ekliyor ve UBL XSD bunu reddediyor:
   *   `"Invoice" elementinde "Id" niteliği kullanılamaz.`
   * Canlı doğrulayıcıya sorulmasaydı bu hata görülmezdi — imza matematiksel
   * olarak geçerliydi, belge ise GİB şemasından düşüyordu.
   */
  signer.addReference({
    xpath: '/*',
    // 🔴 `isEmptyUri` ŞART — yalnız `uri: ''` vermek YETMEZ (ölçüldü).
    isEmptyUri: true,
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/2001/10/xml-exc-c14n#',
    ],
  });

  signer.computeSignature(withContainer, {
    prefix: 'ds',
    location: { reference: "//*[local-name(.)='SignatureInformation']", action: 'append' },
  });

  /*
   * ⚠️ DÜRÜST SINIR: `xades:SignedProperties` ayrı bir `ds:Reference` ile
   * İMZALANMIYOR. Tam XAdES-BES bunu ister; mock'un hedefi plan §1'deki "yapısal
   * geçerlilik"tir — imza algoritması ve belge özeti gerçek, XAdES nitelikleri
   * beyan düzeyinde. Bu sınır `docs/m3-olcum.md`'de de yazılı.
   */
  const signed = signer
    .getSignedXml()
    // İmzaya kimlik ver: `QualifyingProperties` Target'ı buna işaret ediyor.
    // Enveloped transform `ds:Signature` alt ağacını özetin dışında bıraktığı için
    // bu öznitelik imzayı bozmaz.
    .replace(/<ds:Signature([^>]*)>/, `<ds:Signature$1 Id="${signatureId}">`);

  return {
    xml: signed,
    info: {
      kind: 'test-certificate',
      subject,
      selfSigned: true,
      chainValid: false,
      signedAt,
      digestAlgorithm: 'SHA-256',
      signatureAlgorithm: 'RSA-SHA256',
    },
  };
}

/** Belgede gerçek bir XMLDSig imzası var mı. */
export function hasSignature(xml: string): boolean {
  return /<(?:[A-Za-z0-9_.-]+:)?SignatureValue(?:\s|>)/i.test(xml);
}

export function testCertificateInfo(): { subject: string; pem: string } {
  const { cert, subject } = loadCertificate();
  return { subject, pem: cert };
}
