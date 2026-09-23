/**
 * Girdi doğrulama.
 *
 * ⚠️ VKN/TCKN'de YALNIZ uzunluk ve rakam denetlenir. MimForge'un `INVALID_VKN`
 * kapısı da uzunluk kapısıdır (sözlük §4.4, `routes.reply.ts:204`); bir sağlama
 * (checksum) algoritması M0'da ÖLÇÜLMEDİ, o yüzden uydurulmuyor.
 */
import { MimMockError, type FieldError } from './errors.js';
import { isInvoiceProfileId } from './profiles.js';

export function isValidTaxIdentifier(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9]{10}$|^[0-9]{11}$/.test(value);
}

export function assertTaxIdentifier(value: unknown): string {
  if (!isValidTaxIdentifier(value)) throw new MimMockError('INVALID_VKN');
  return value;
}

export interface CompanyInput {
  vkn: string;
  title: string;
  addressStreet?: string | undefined;
  addressDistrict?: string | undefined;
  addressCity?: string | undefined;
  addressCountry: string;
  taxOffice?: string | undefined;
  pkAliases: string[];
  gbAliases: string[];
  profiles: string[];
  templateId?: string | undefined;
  seriesPrefix?: string | undefined;
  eInvoiceRegistered: boolean;
}

function optionalString(
  body: Record<string, unknown>,
  field: string,
  errors: FieldError[],
): string | undefined {
  const value = body[field];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    errors.push({ field, reason: 'Metin olmalı.' });
    return undefined;
  }
  return value;
}

function stringArray(body: Record<string, unknown>, field: string, errors: FieldError[]): string[] {
  const value = body[field];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    errors.push({ field, reason: 'Metin dizisi olmalı.' });
    return [];
  }
  return value as string[];
}

/** Şirket gövdesini doğrular; alan hataları TEK seferde toplanır (fail-closed). */
export function parseCompanyInput(raw: unknown): CompanyInput {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new MimMockError('VALIDATION_FAILED', { reason: 'Gövde bir JSON nesnesi olmalı.' });
  }
  const body = raw as Record<string, unknown>;

  // VKN/TCKN'nin kendi ölçülmüş kodu var; diğer alanlardan önce ve ayrı bakılır.
  const vkn = assertTaxIdentifier(body.vkn);

  const errors: FieldError[] = [];

  const title = body.title;
  if (typeof title !== 'string' || title.trim() === '') {
    errors.push({ field: 'title', reason: 'Unvan zorunlu.' });
  }

  const addressStreet = optionalString(body, 'addressStreet', errors);
  const addressDistrict = optionalString(body, 'addressDistrict', errors);
  const addressCity = optionalString(body, 'addressCity', errors);
  const taxOffice = optionalString(body, 'taxOffice', errors);
  const templateId = optionalString(body, 'templateId', errors);
  const seriesPrefix = optionalString(body, 'seriesPrefix', errors);

  const addressCountry =
    typeof body.addressCountry === 'string' && body.addressCountry !== ''
      ? body.addressCountry
      : 'Türkiye';

  const pkAliases = stringArray(body, 'pkAliases', errors);
  const gbAliases = stringArray(body, 'gbAliases', errors);
  const profiles = stringArray(body, 'profiles', errors);

  const eInvoiceRegistered = body.eInvoiceRegistered;
  if (typeof eInvoiceRegistered !== 'boolean') {
    errors.push({ field: 'eInvoiceRegistered', reason: 'true/false olmalı.' });
  }

  if (errors.length > 0) throw new MimMockError('VALIDATION_FAILED', { errors });

  // Profil kümesi kendi ölçülmüş kaynağına sahip (profiles.ts) — ayrı kod.
  for (const profile of profiles) {
    if (!isInvoiceProfileId(profile)) {
      throw new MimMockError('UNKNOWN_PROFILE', { reason: `Tanınmayan ProfileID: ${profile}` });
    }
  }

  return {
    vkn,
    title: (title as string).trim(),
    addressStreet,
    addressDistrict,
    addressCity,
    addressCountry,
    taxOffice,
    pkAliases,
    gbAliases,
    profiles,
    templateId,
    seriesPrefix,
    eInvoiceRegistered: eInvoiceRegistered as boolean,
  };
}
