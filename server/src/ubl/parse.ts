/**
 * Küçük UBL ayrıştırıcı — plan §2c: *"depo içi küçük ayrıştırıcı"*.
 *
 * MimForge'un `packages/ubl-parse`i private ve gerekmiyor: mock gelen XML'den
 * yalnız birkaç alan okur (ETTN, taraf VKN'leri, profil, tip, belge no, toplam).
 * Doğrulamanın kendisi CANLI şematrondadır (K4) — burada iş görmüyoruz.
 *
 * ⚠️ Bu ayrıştırıcı bir doğrulayıcı DEĞİLDİR. Bir alanı bulamazsa `null` döner ve
 * kapı kararını çağıran verir; sessizce varsayılan uydurmaz.
 */
import type { DocumentType } from '../status.js';

export interface ParsedUbl {
  /** UBL kök elemanı, küçük harf: `invoice` | `creditnote` | `despatchadvice` | … */
  root: string;
  /** `cbc:UUID` — ETTN. */
  ettn: string | null;
  /** `cbc:ID` — belge numarası (numarasız belgede yok). */
  documentNumber: string | null;
  /** `cbc:IssueDate` — `YYYY-MM-DD`. */
  issueDate: string | null;
  /** `cbc:ProfileID`. */
  profileId: string | null;
  /** `cbc:InvoiceTypeCode` (veya belge tipine göre muadili). */
  typeCode: string | null;
  senderVkn: string | null;
  receiverVkn: string | null;
  /** `cbc:DocumentCurrencyCode`. */
  currencyCode: string | null;
  /** `cbc:PayableAmount` — metin olarak, yuvarlama yapılmaz. */
  payableAmount: string | null;
  /**
   * KÖK seviyesindeki `cac:TaxTotal` sayısı (ingest `MULTIPLE_TAX_TOTALS` kapısı).
   * ⚠️ Kalem ve iskonto blokları ÇIKARILARAK sayılır: ölçüldü ki geçerli bir
   * faturada toplam 2-3 `TaxTotal` bulunur ama kökte yalnız 1 vardır. Ham sayım
   * yapan bir kapı MimForge'un kabul ettiği her belgeyi reddederdi.
   */
  rootTaxTotalCount: number;
  /**
   * GERÇEK XMLDSig imzası var mı.
   * ⚠️ UBL-TR faturasında `cac:Signature` elemanı imza DEĞİLDİR (imzalayan tarafın
   * beyanıdır) ve imzasız fikstürlerde de bulunur — ölçüldü: `tpl-forge/samples`
   * belgelerinin hiçbirinde `ds:Signature` yok ama `cac:Signature` var.
   */
  hasSignature: boolean;
}

export class UblParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UblParseError';
  }
}

/** Yorumları ve CDATA'yı kaldırır — kaba tarama yanlış eşleşmesin. */
function stripNoise(xml: string): string {
  return xml.replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
}

function firstTagValue(xml: string, localName: string): string | null {
  // Ad alanı öneki ne olursa olsun yerel adı yakala.
  const pattern = new RegExp(`<(?:[A-Za-z0-9_.-]+:)?${localName}(?:\\s[^>]*)?>([^<]*)</`, 'i');
  const match = pattern.exec(xml);
  const value = match?.[1]?.trim();
  return value ? value : null;
}

function countTags(xml: string, localName: string): number {
  const pattern = new RegExp(`<(?:[A-Za-z0-9_.-]+:)?${localName}(?:\\s|>|/)`, 'gi');
  return (xml.match(pattern) ?? []).length;
}

/**
 * Kök seviyesinde ARANAN alanlar için gürültüyü siler: kalemler, taraf blokları,
 * UBL uzantıları (imza buraya gömülür) ve ek belge referansları.
 *
 * 🔴 Neden gerekli: `cbc:ID` UBL'de ONLARCA yerde geçer — taraf kimliği
 * (`<cbc:ID schemeID="VKN">`), vergi şeması, ülke kodu… Kök `cbc:ID` sökülmüş bir
 * belgede naif "ilk ID" araması TARAF VKN'sini belge numarası sanıyordu ve
 * numarasız belge "numaralı" görünüp `SERIES_PREFIX_NOT_APPLICABLE` alıyordu.
 */
function stripNonRootBlocks(xml: string): string {
  const block = (name: string) =>
    new RegExp(
      `<(?:[A-Za-z0-9_.-]+:)?${name}(?:\\s[^>]*)?>[\\s\\S]*?<\\/(?:[A-Za-z0-9_.-]+:)?${name}>`,
      'gi',
    );
  return [
    'UBLExtensions',
    'AccountingSupplierParty',
    'AccountingCustomerParty',
    'BuyerCustomerParty',
    'SellerSupplierParty',
    'TaxRepresentativeParty',
    'DespatchSupplierParty',
    'DeliveryCustomerParty',
    'Delivery',
    'PaymentMeans',
    'PaymentTerms',
    'AdditionalDocumentReference',
    'BillingReference',
    'OrderReference',
    'DespatchDocumentReference',
    'ReceiptDocumentReference',
    'OriginatorDocumentReference',
    'ContractDocumentReference',
    'Signature',
    'TaxTotal',
    'WithholdingTaxTotal',
    'LegalMonetaryTotal',
  ].reduce((acc, name) => acc.replace(block(name), ''), stripLineBlocks(xml));
}

/** Kök `cbc:ID` — ÖZNİTELİKSİZ olan; belge numarası budur. */
function rootDocumentNumber(xml: string): string | null {
  const root = stripNonRootBlocks(xml);
  const match = /<(?:[A-Za-z0-9_.-]+:)?ID>([^<]*)<\//.exec(root);
  const value = match?.[1]?.trim();
  return value ? value : null;
}

/** Kalem/iskonto bloklarını siler — kök seviyesi sayımı için. */
function stripLineBlocks(xml: string): string {
  return xml
    .replace(/<(?:[A-Za-z0-9_.-]+:)?InvoiceLine(?:\s[^>]*)?>[\s\S]*?<\/(?:[A-Za-z0-9_.-]+:)?InvoiceLine>/gi, '')
    .replace(/<(?:[A-Za-z0-9_.-]+:)?CreditNoteLine(?:\s[^>]*)?>[\s\S]*?<\/(?:[A-Za-z0-9_.-]+:)?CreditNoteLine>/gi, '')
    .replace(/<(?:[A-Za-z0-9_.-]+:)?DespatchLine(?:\s[^>]*)?>[\s\S]*?<\/(?:[A-Za-z0-9_.-]+:)?DespatchLine>/gi, '')
    .replace(/<(?:[A-Za-z0-9_.-]+:)?AllowanceCharge(?:\s[^>]*)?>[\s\S]*?<\/(?:[A-Za-z0-9_.-]+:)?AllowanceCharge>/gi, '');
}

/**
 * XMLDSig imzası araması. `cac:Signature` KASTEN dışarıda — o imza değildir.
 * `SignatureValue` yerel adı ayırt edicidir: yalnız gerçek XMLDSig taşır.
 */
function hasXmlDsigSignature(xml: string): boolean {
  return /<(?:[A-Za-z0-9_.-]+:)?SignatureValue(?:\s|>)/i.test(xml);
}

/** `<cac:X>…</cac:X>` bloğunu döndürür (ilk eşleşme). */
function blockOf(xml: string, localName: string): string | null {
  const pattern = new RegExp(
    `<(?:[A-Za-z0-9_.-]+:)?${localName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[A-Za-z0-9_.-]+:)?${localName}>`,
    'i',
  );
  return pattern.exec(xml)?.[1] ?? null;
}

/** Bir taraf bloğundan VKN/TCKN okur: `cbc:ID schemeID="VKN|TCKN"`. */
function partyTaxId(partyBlock: string | null): string | null {
  if (!partyBlock) return null;
  const scoped = /<(?:[A-Za-z0-9_.-]+:)?ID[^>]*schemeID="(?:VKN|TCKN)"[^>]*>([^<]*)</i.exec(
    partyBlock,
  );
  const value = scoped?.[1]?.trim();
  if (value) return value;
  // schemeID yoksa PartyIdentification içindeki ilk ID'ye düş.
  const identification = blockOf(partyBlock, 'PartyIdentification');
  return identification ? firstTagValue(identification, 'ID') : null;
}

/** UBL kökünü tespit eder (küçük harf yerel ad). */
export function detectUblRoot(xml: string): string | null {
  const match = /<(?:[A-Za-z0-9_.-]+:)?([A-Za-z][A-Za-z0-9_.-]*)(?:\s[^>]*)?>/.exec(
    stripNoise(xml).replace(/<\?[\s\S]*?\?>/g, ''),
  );
  return match?.[1]?.toLowerCase() ?? null;
}

/** Bilinen UBL köklerinden belge tipi çıkarımı — kesin olmayan yerde `null`. */
export function documentTypeFromUbl(
  root: string,
  profileId: string | null,
  typeCode: string | null,
): DocumentType | null {
  if (root === 'despatchadvice') return 'EIRSALIYE';
  if (root === 'creditnote') return 'EMM';
  if (root !== 'invoice') return null;

  // e-Arşiv düzlemi profille ayrılır (ölçüldü: json2ubl-ts InvoiceProfileId).
  if (profileId === 'EARSIVFATURA') {
    // e-SMM de EARSIVFATURA profili + SERBESTMESLEKMAKBUZU tipiyle gelir.
    return typeCode === 'SERBESTMESLEKMAKBUZU' ? 'ESMM' : 'EARSIV';
  }
  if (profileId === null) return null;
  return 'EFATURA';
}

export function parseUbl(xmlInput: string): ParsedUbl {
  const trimmed = xmlInput.trimStart();
  if (!trimmed.startsWith('<')) {
    throw new UblParseError('Gövde `<` ile başlamıyor — XML değil.');
  }
  const xml = stripNoise(trimmed);
  const root = detectUblRoot(xml);
  if (root === null) {
    throw new UblParseError('UBL kök elemanı bulunamadı.');
  }

  const supplier = blockOf(xml, 'AccountingSupplierParty');
  const customer = blockOf(xml, 'AccountingCustomerParty');

  // Toplam: `cac:LegalMonetaryTotal` içindeki `cbc:PayableAmount`.
  const monetaryTotal = blockOf(xml, 'LegalMonetaryTotal');

  return {
    root,
    ettn: firstTagValue(xml, 'UUID'),
    documentNumber: rootDocumentNumber(xml),
    issueDate: firstTagValue(xml, 'IssueDate'),
    profileId: firstTagValue(xml, 'ProfileID'),
    typeCode: firstTagValue(xml, 'InvoiceTypeCode') ?? firstTagValue(xml, 'CreditNoteTypeCode'),
    senderVkn: partyTaxId(supplier),
    receiverVkn: partyTaxId(customer),
    currencyCode: firstTagValue(xml, 'DocumentCurrencyCode'),
    payableAmount: monetaryTotal ? firstTagValue(monetaryTotal, 'PayableAmount') : null,
    rootTaxTotalCount: countTags(stripLineBlocks(xml), 'TaxTotal'),
    hasSignature: hasXmlDsigSignature(xml),
  };
}

/**
 * Numarasız belgeye `cbc:ID` gömer (MimForge G4: *"mimkit reserve + `cbc:ID` göm"*,
 * `worker/src/activities.ts:634-637`).
 *
 * ⚠️ UBL XSD element SIRASI katıdır: `cbc:ID`, `cbc:ProfileID`'den SONRA ve
 * `cbc:CopyIndicator`/`cbc:UUID`'den ÖNCE gelmelidir. Yanlış yere konan numara
 * belgeyi XSD'den düşürür — bu tam olarak M2'de korpusun 11 dosyasını düşüren
 * hata sınıfıdır, o yüzden yer seçimi tesadüfi değil.
 */
export function embedDocumentNumber(xml: string, documentNumber: string): string {
  // ⚠️ KÖK ID'ye bakılır. Naif "herhangi bir ID" araması taraf kimliklerini
  // yakalıyor ve her belgeyi "zaten numaralı" sanıyordu.
  if (rootDocumentNumber(xml) !== null) {
    throw new UblParseError('Belgede zaten bir kök cbc:ID var; numara gömülemez.');
  }
  const profileId = /<((?:[A-Za-z0-9_.-]+:)?)ProfileID(?:\s[^>]*)?>[^<]*<\/(?:[A-Za-z0-9_.-]+:)?ProfileID>/.exec(
    xml,
  );
  if (!profileId) {
    throw new UblParseError('cbc:ProfileID bulunamadı; numaranın yeri belirlenemedi.');
  }
  const prefix = profileId[1] ?? '';
  const insertion = `\n  <${prefix}ID>${documentNumber}</${prefix}ID>`;
  const at = profileId.index + profileId[0].length;
  return xml.slice(0, at) + insertion + xml.slice(at);
}
