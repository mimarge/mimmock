/**
 * UBL-TR `ProfileID` kümesi — ÖLÇÜLDÜ, uydurulmadı.
 *
 * Kaynak: `json2ubl-ts/src/types/enums.ts:2-15` (`enum InvoiceProfileId`, 12 değer).
 * json2ubl-ts npm'de public (`5.0.0`) ve mock'un JSON→UBL yolunun kütüphanesidir
 * (plan K1), yani bu liste mock'un gerçekten üretebildiği kümeyle aynıdır.
 */
export const INVOICE_PROFILE_IDS = [
  'TEMELFATURA',
  'TICARIFATURA',
  'YOLCUBERABERFATURA',
  'IHRACAT',
  'OZELFATURA',
  'KAMU',
  'HKS',
  'ENERJI',
  'ILAC_TIBBICIHAZ',
  'YATIRIMTESVIK',
  'IDIS',
  'EARSIVFATURA',
] as const;

export type InvoiceProfileId = (typeof INVOICE_PROFILE_IDS)[number];

const PROFILE_SET: ReadonlySet<string> = new Set(INVOICE_PROFILE_IDS);

export function isInvoiceProfileId(value: string): value is InvoiceProfileId {
  return PROFILE_SET.has(value);
}

/** e-Arşiv düzlemi tek profil taşır; kalanı e-Fatura düzlemidir. */
export const EARSIV_PROFILE: InvoiceProfileId = 'EARSIVFATURA';
