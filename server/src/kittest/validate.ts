/**
 * Doğrulama istemcisi — mimkit `POST /v1/validate` (XSD + Schematron, plan K4: CANLI).
 *
 * MimForge'da doğrulamanın birincil yolu mimkit'tir (`packages/ubl-validate`:
 * "mimkit BİRİNCİL"). Mock tek bağımlılıkla çalışır: doğrulama, numaralama ve
 * görüntü aynı mimkit'ten gelir.
 *
 * Sözleşme CANLI ÖLÇÜLDÜ (2026-09-23):
 *   200  → düz nesne { valid, documentType, profileApplied, errors[], appliedXsd, appliedSchematron, … }
 *          `errors[]` = { severity, source: 'SCHEMA'|'SCHEMATRON', code, message, xpath, line }
 *   401  → { error: { code: 'UNAUTHORIZED' } }         anahtar yanlış
 *   400  → { error: { code: 'PARAMETERS_INVALID' } }   isteği BİZ yanlış kurduk
 *   422  → { error: { code: 'DOCUMENT_REJECTED' } }    içerik işlenemedi (XML değil / tür tespit edilemedi)
 *   `X-Scope-Id` doğrulama için GEREKMEZ.
 *
 * 🔑 Hata sınıflaması (MimForge'dan ölçülen ayrım):
 *   • "belge geçersiz"  → 200 + valid:false  → ingest 400 SCHEMA_INVALID
 *   • 422               → belge işlenemedi   → ingest 400 MALFORMED_XML
 *   • geri kalan her şey (401/403/400/429/5xx/ağ) → ALTYAPI → ingest 503 VALIDATOR_UNAVAILABLE
 *   401 ya da 400'ü "belgeniz hatalı" diye göstermek, anahtar/istek hatasını müşteri
 *   hatası gibi gösterirdi.
 */

export interface SchematronError {
  ruleId: string;
  test: string;
  message: string;
}

export interface ValidateResult {
  validSchema: boolean;
  validSchematron: boolean;
  /** Şematron hataları (yapılandırılmış). */
  errors: SchematronError[];
  /** XSD hataları (metin). */
  schemaErrors: string[];
  appliedXsd: string | undefined;
  appliedSchematron: string | undefined;
}

export interface ValidateOptions {
  /** Şematron alt tipi ipucu — küçük harf (`efatura`, `earchive`, …). */
  type?: string | undefined;
  /** Doğrulama profili (`unsigned-invoice`, `unnumbered-invoice`, …). */
  profile?: string | undefined;
}

/** Altyapı arızası — erişilemez / yetkisiz / kısıtlandı / 5xx. İngest bunu 503 yapar. */
export class ValidatorUnavailableError extends Error {
  /** mimkit hata kodu (UNAUTHORIZED, RATE_LIMITED …) ya da null. */
  readonly code: string | null;
  readonly status: number | null;
  constructor(message: string, options?: { cause?: unknown; code?: string | null; status?: number | null }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ValidatorUnavailableError';
    this.code = options?.code ?? null;
    this.status = options?.status ?? null;
  }
}

/** Belge işlenemedi (422 DOCUMENT_REJECTED). İngest bunu 400 MALFORMED_XML yapar. */
export class ValidatorBadRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ValidatorBadRequestError';
    this.status = status;
  }
}

export interface ValidatorConfig {
  url: string;
  token: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

/** Hazırlık sondasının sonucu — "erişildi ama anahtar yanlış" ayrı söylenir. */
export interface ValidatorReadiness {
  ready: boolean;
  /** İnsan için tek satır sebep. */
  detail: string;
}

export interface Validator {
  validate(xml: Buffer | string, options?: ValidateOptions): Promise<ValidateResult>;
  /**
   * Hem erişimi hem anahtarı sınar. `/healthz` anahtar denetlemez; bu yüzden sonda
   * XML olmayan bir gövdeyle doğrulama ucuna gider: 422 = erişildi VE yetkili.
   */
  readiness(): Promise<ValidatorReadiness>;
}

/**
 * Şematron `type` parametresinin kabul edilen değerleri — küme dışı değer mimkit'te
 * 400 PARAMETERS_INVALID'dir (ölçüldü). Eşlenemeyen ipucu HİÇ gönderilmez: servis
 * tipi belgeden kendisi türetir.
 */
const SCHEMATRON_TYPES: ReadonlySet<string> = new Set([
  'efatura', 'earchive', 'goruntuleme', 'eirsaliye', 'uygulamayaniti',
]);

interface MimkitError {
  severity?: string;
  source?: string;
  code?: string | null;
  message?: string;
  xpath?: string | null;
  line?: number | null;
}

/**
 * mimkit yanıtı → ValidateResult.
 *
 * 🔴 `validSchema`/`validSchematron` GERİ KURULUR: mimkit iki bayrağı tek `valid`e
 * indirger; kayıp bilgi `errors[].source`'tan alınır. `valid:false` ama hiç hata
 * yoksa İKİSİ de false (fail-closed — hangi katmanın düştüğü bilinmiyorsa "geçti"
 * demek sahte yeşil olurdu). Eşleme MimForge `fromMimkit` ile aynı: `code→ruleId`,
 * `xpath→test` (mimkit şematronun test ifadesini `xpath` adıyla taşır).
 */
export function fromMimkit(raw: unknown): ValidateResult {
  if (raw === null || typeof raw !== 'object' || !('valid' in raw)) {
    throw new ValidatorUnavailableError('mimkit doğrulama yanıtı beklenen şekilde değil (valid alanı yok)');
  }
  const body = raw as { valid?: unknown; errors?: unknown; appliedXsd?: unknown; appliedSchematron?: unknown };
  const list: MimkitError[] = Array.isArray(body.errors) ? (body.errors as MimkitError[]) : [];
  const valid = body.valid === true;

  const schemaErrors = list
    .filter((e) => e.source === 'SCHEMA')
    .map((e) => (typeof e.message === 'string' ? e.message : String(e.message ?? '')));
  const errors: SchematronError[] = list
    .filter((e) => e.source !== 'SCHEMA')
    .map((e) => ({
      ruleId: typeof e.code === 'string' ? e.code : '',
      test: typeof e.xpath === 'string' ? e.xpath : '',
      message: typeof e.message === 'string' ? e.message : String(e.message ?? ''),
    }));

  const hasSchema = schemaErrors.length > 0;
  const hasSchematron = errors.length > 0;
  return {
    validSchema: valid ? true : list.length === 0 ? false : !hasSchema,
    validSchematron: valid ? true : list.length === 0 ? false : !hasSchematron,
    errors,
    schemaErrors,
    appliedXsd: typeof body.appliedXsd === 'string' && body.appliedXsd !== '' ? body.appliedXsd : undefined,
    appliedSchematron:
      typeof body.appliedSchematron === 'string' && body.appliedSchematron !== '' ? body.appliedSchematron : undefined,
  };
}

async function errorOf(response: Response): Promise<{ code: string | null; message: string }> {
  const text = await response.text().catch(() => '');
  try {
    const parsed = JSON.parse(text) as { error?: { code?: string; message?: string } };
    return { code: parsed.error?.code ?? null, message: parsed.error?.message ?? text.slice(0, 200) };
  } catch {
    return { code: null, message: text.slice(0, 200) };
  }
}

export function createValidator(config: ValidatorConfig): Validator {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const base = config.url.replace(/\/+$/, '');

  async function post(body: unknown, timeoutMs: number): Promise<Response> {
    return fetchImpl(`${base}/v1/validate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  }

  return {
    async readiness() {
      if (!base) return { ready: false, detail: 'MIMMOCK_MIMKIT_URL ayarlı değil' };
      if (!config.token) return { ready: false, detail: 'MIMMOCK_MIMKIT_TOKEN ayarlı değil' };
      let response: Response;
      try {
        response = await post({ xmlBase64: Buffer.from('hazirlik-sondasi').toString('base64') }, Math.min(config.timeoutMs, 10_000));
      } catch (error) {
        return { ready: false, detail: `mimkit'e ulaşılamadı: ${error instanceof Error ? error.message : String(error)}` };
      }
      // 422 = içerik reddedildi → istek kimlikten geçti, servis ayakta.
      if (response.status === 422 || response.ok) return { ready: true, detail: 'erişildi, anahtar geçerli' };
      const { code, message } = await errorOf(response);
      if (response.status === 401 || response.status === 403) {
        return { ready: false, detail: `mimkit anahtarı reddedildi (${response.status} ${code ?? ''}): ${message}` };
      }
      return { ready: false, detail: `mimkit ${response.status} ${code ?? ''}: ${message}` };
    },

    async validate(xml, options) {
      const bytes = typeof xml === 'string' ? Buffer.from(xml, 'utf8') : xml;
      const type = options?.type?.toLowerCase();
      // 🔴 `suppressions` ASLA gönderilmez ve `parameters` yalnız sabit `type` taşır:
      // MimForge canlıda ölçtü — bu alanlar doğrulamayı tamamen kapatabiliyor.
      const body = {
        xmlBase64: bytes.toString('base64'),
        ...(options?.profile ? { profile: options.profile } : {}),
        ...(type && SCHEMATRON_TYPES.has(type) ? { parameters: { type } } : {}),
      };

      let response: Response;
      try {
        response = await post(body, config.timeoutMs);
      } catch (error) {
        throw new ValidatorUnavailableError(
          `mimkit doğrulama ucuna ulaşılamadı: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }

      if (response.ok) {
        let parsed: unknown;
        try {
          parsed = await response.json();
        } catch (error) {
          throw new ValidatorUnavailableError('mimkit doğrulama yanıtı JSON değil', { cause: error, status: response.status });
        }
        return fromMimkit(parsed);
      }

      const { code, message } = await errorOf(response);
      // TEK belge-reddi dalı: 422.
      if (response.status === 422) {
        throw new ValidatorBadRequestError(`mimkit 422 (${code ?? 'DOCUMENT_REJECTED'}): ${message}`, 422);
      }
      throw new ValidatorUnavailableError(`mimkit ${response.status} (${code ?? 'bilinmiyor'}): ${message}`, {
        code,
        status: response.status,
      });
    },
  };
}
