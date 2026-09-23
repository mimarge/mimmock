/**
 * mimkit doğrulama istemcisi — sınıflama ve eşleme. AĞ İSTEMEZ.
 *
 * Sözleşmenin en kolay bozulan iki yeri:
 *   1. HATA SINIFI — yalnız 422 "belge işlenemedi"dir; 401/400/429/5xx altyapıdır.
 *      401'i belge hatası saymak, yanlış anahtarı "belgeniz bozuk" diye gösterirdi.
 *   2. EŞLEME — mimkit iki bayrağı tek `valid`e indirir; kaynaktan geri kurulmazsa
 *      XSD reddi ile şematron reddi ayırt edilemez. `valid:false` + hata yok = fail-closed.
 * Yanıt örnekleri canlı ölçümden (2026-09-23) alındı.
 */
import { describe, it, expect } from 'vitest';
import {
  createValidator,
  fromMimkit,
  ValidatorUnavailableError,
  ValidatorBadRequestError,
} from './validate.js';

function stubFetch(response: { status: number; body?: unknown; text?: string }, seen?: Array<{ url: string; init: RequestInit }>): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    seen?.push({ url, init });
    return new Response(response.text ?? JSON.stringify(response.body ?? {}), {
      status: response.status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

const config = { url: 'https://mimkit.test', token: 'anahtar', timeoutMs: 1000 };
const mimkitError = (code: string) => ({ error: { code, message: code } });

describe('hata sınıflaması', () => {
  it('422 DOCUMENT_REJECTED → BELGE işlenemedi (ValidatorBadRequestError)', async () => {
    const v = createValidator({ ...config, fetchImpl: stubFetch({ status: 422, body: mimkitError('DOCUMENT_REJECTED') }) });
    await expect(v.validate('x')).rejects.toBeInstanceOf(ValidatorBadRequestError);
  });

  it.each([
    [401, 'UNAUTHORIZED'],
    [403, 'FORBIDDEN'],
    [400, 'PARAMETERS_INVALID'],
    [429, 'RATE_LIMITED'],
    [500, 'INTERNAL'],
    [503, 'BACKEND_UNAVAILABLE'],
  ])('%i %s → ALTYAPI (ValidatorUnavailableError), kod taşınır', async (status, code) => {
    const v = createValidator({ ...config, fetchImpl: stubFetch({ status, body: mimkitError(code) }) });
    const error = await v.validate('<x/>').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidatorUnavailableError);
    expect((error as ValidatorUnavailableError).code).toBe(code);
    expect((error as ValidatorUnavailableError).status).toBe(status);
  });

  it('ağ hatası → ALTYAPI', async () => {
    const failing = (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
    const v = createValidator({ ...config, fetchImpl: failing });
    await expect(v.validate('<x/>')).rejects.toBeInstanceOf(ValidatorUnavailableError);
  });

  it('200 ama gövde beklenen şekilde değil → ALTYAPI (sessizce "geçti" denmez)', async () => {
    const v = createValidator({ ...config, fetchImpl: stubFetch({ status: 200, body: { baska: 1 } }) });
    await expect(v.validate('<x/>')).rejects.toBeInstanceOf(ValidatorUnavailableError);
  });
});

describe('istek', () => {
  it('anahtar Bearer ile gider; tip ipucu küçük harfe iner; profil taşınır', async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const v = createValidator({ ...config, fetchImpl: stubFetch({ status: 200, body: { valid: true, errors: [] } }, seen) });
    await v.validate('<x/>', { type: 'EFATURA', profile: 'unsigned-invoice' });
    expect(seen[0]!.url).toBe('https://mimkit.test/v1/validate');
    expect((seen[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer anahtar');
    const body = JSON.parse(String(seen[0]!.init.body)) as Record<string, unknown>;
    expect(body).toEqual({
      xmlBase64: Buffer.from('<x/>').toString('base64'),
      profile: 'unsigned-invoice',
      parameters: { type: 'efatura' },
    });
  });

  it('🔴 küme dışı tip ipucu GÖNDERİLMEZ (mimkit 400 verir) ve `suppressions` ASLA gönderilmez', async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const v = createValidator({ ...config, fetchImpl: stubFetch({ status: 200, body: { valid: true, errors: [] } }, seen) });
    await v.validate('<x/>', { type: 'bilinmeyen' });
    const body = JSON.parse(String(seen[0]!.init.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty('parameters');
    expect(body).not.toHaveProperty('suppressions');
  });
});

describe('eşleme (mimkit → ValidateResult)', () => {
  it('geçerli → iki bayrak da true, uygulanan şema adları taşınır', () => {
    const r = fromMimkit({ valid: true, errors: [], appliedXsd: 'UBL-Invoice-2.1.xsd', appliedSchematron: 'UBLTR_MAIN' });
    expect(r).toMatchObject({ validSchema: true, validSchematron: true, appliedXsd: 'UBL-Invoice-2.1.xsd', appliedSchematron: 'UBLTR_MAIN' });
  });

  it('yalnız SCHEMA hatası → validSchema=false, validSchematron=true; metin schemaErrors\'a', () => {
    const r = fromMimkit({
      valid: false,
      errors: [{ severity: 'ERROR', source: 'SCHEMA', code: null, message: 'cvc-complex-type', xpath: null, line: 12 }],
    });
    expect(r.validSchema).toBe(false);
    expect(r.validSchematron).toBe(true);
    expect(r.schemaErrors).toEqual(['cvc-complex-type']);
    expect(r.errors).toEqual([]);
  });

  it('yalnız SCHEMATRON hatası → code→ruleId, xpath→test', () => {
    const r = fromMimkit({
      valid: false,
      errors: [{ source: 'SCHEMATRON', code: 'ProfileIDCheck', message: 'Geçersiz profil', xpath: 'cbc:ProfileID = …' }],
    });
    expect(r.validSchema).toBe(true);
    expect(r.validSchematron).toBe(false);
    expect(r.errors).toEqual([{ ruleId: 'ProfileIDCheck', test: 'cbc:ProfileID = …', message: 'Geçersiz profil' }]);
  });

  it('🔴 valid:false ama hata listesi BOŞ → İKİSİ de false (fail-closed)', () => {
    const r = fromMimkit({ valid: false, errors: [] });
    expect(r.validSchema).toBe(false);
    expect(r.validSchematron).toBe(false);
  });
});

describe('hazırlık sondası', () => {
  it('422 → hazır (erişildi VE anahtar geçerli)', async () => {
    const v = createValidator({ ...config, fetchImpl: stubFetch({ status: 422, body: mimkitError('DOCUMENT_REJECTED') }) });
    expect((await v.readiness()).ready).toBe(true);
  });

  it('401 → hazır DEĞİL ve sebep anahtarı söyler', async () => {
    const v = createValidator({ ...config, fetchImpl: stubFetch({ status: 401, body: mimkitError('UNAUTHORIZED') }) });
    const r = await v.readiness();
    expect(r.ready).toBe(false);
    expect(r.detail).toMatch(/anahtar/);
  });

  it('adres ya da anahtar yoksa ağa çıkmadan hazır değil', async () => {
    const neverCalled = (async () => { throw new Error('çağrılmamalıydı'); }) as unknown as typeof fetch;
    expect((await createValidator({ ...config, url: '', fetchImpl: neverCalled }).readiness()).detail).toMatch(/URL/);
    expect((await createValidator({ ...config, token: '', fetchImpl: neverCalled }).readiness()).detail).toMatch(/TOKEN/);
  });
});
