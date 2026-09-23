/**
 * Numaratör istemcisi — mimkit (plan K4/K6: CANLI numaratör).
 *
 * Sözleşme ÖLÇÜLDÜ: `docs/m2-olcum-kittest-sozlesmesi.md` §2 (`@mimarge/mimkit@0.8.0`
 * `dist/numbers.js` + `dist/core.js:57-85`). SDK npm'de public DEĞİL (404), o yüzden
 * import edilemez; aynı HTTP sözleşmesi burada elle konuşulur.
 *
 * ⚠️ Bu istemci CANLI bir numaratöre karşı ÖLÇÜLMEDİ — `kittest` adresi bu oturumda
 * yoktu. Sözleşme testleri sahte sunucuya karşı koşar (`numbers.test.ts`).
 */
import { randomUUID } from 'node:crypto';

export interface ReserveInput {
  /**
   * 🔴 ZORUNLU ve yeniden denemede DEĞİŞMEZ. Önerilen değer belgenin ETTN'i.
   * Yeni anahtar üretmek mükerrer numara yakar (ölçüm §2).
   */
  idempotencyKey: string;
  /** Belgenin düzenlenme TARİHİ (saat değil), `YYYY-MM-DD`. */
  date: string;
  /** Mükellefin VKN/TCKN'si — `x-owner-tax-id` başlığına gider, bu uçta zorunlu. */
  ownerTaxId: string;
  seriesId?: string | undefined;
  docType?: string | undefined;
}

export interface Reservation {
  reservationId: string;
  number: string;
  seriesId: string | undefined;
  seriesPrefix: string | undefined;
  /** HTTP 200 = aynı anahtarla tekrar (sunucu yeni numara YAKMADI). */
  replayed: boolean;
}

/** Numaratör erişilemez / 5xx → `NUMBERING_UNAVAILABLE` (503). */
export class NumberingUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'NumberingUnavailableError';
  }
}

/** Numaratör isteği reddetti (4xx) — iş kodu gövdeden okunur. */
export class NumberingRejectedError extends Error {
  readonly status: number;
  /** Servisin iş kodu (örn. `SERIES_NOT_FOUND`, `NUMBER_ALREADY_CLAIMED`). */
  readonly code: string | undefined;
  constructor(message: string, status: number, code: string | undefined) {
    super(message);
    this.name = 'NumberingRejectedError';
    this.status = status;
    this.code = code;
  }
}

export interface NumbersConfig {
  url: string;
  token: string;
  scopeId: string | undefined;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

export interface Series {
  id: string;
  prefix: string;
  docType: string;
  isDefault: boolean;
  active: boolean;
}

export interface Numbers {
  reserve(input: ReserveInput): Promise<Reservation>;
  listSeries(ownerTaxId: string): Promise<Series[]>;
  createSeries(input: {
    ownerTaxId: string;
    prefix: string;
    docType: string;
    name?: string;
  }): Promise<Series>;
  /**
   * Önekten seri KİMLİĞİNE çözer; yoksa açar (MimForge'un K-N7 `SERIES_NOT_FOUND`
   * onarım deseni). 🔴 `reserve` önek DEĞİL kimlik ister — canlı ölçüldü:
   * önek gönderilince `NO_DEFAULT_SERIES` (404) dönüyor.
   */
  resolveSeriesId(input: { ownerTaxId: string; prefix: string; docType: string }): Promise<string>;
  health(): Promise<boolean>;
}

export function createNumbers(config: NumbersConfig): Numbers {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const base = config.url.replace(/\/+$/, '');
  /** Önek→kimlik önbelleği; her belgede seri listesi çekmeyelim. */
  const seriesCache = new Map<string, string>();

  /**
   * mimkit `scopeId`'si MimForge'da AKTİF ŞUBE'dir (`routes.series.ts:13`).
   * Mock'ta şubenin karşılığı şirkettir (plan §3), o yüzden varsayılan kapsam
   * mükellefin kendisidir. Paylaşılan kurulumlarda env ile sabitlenebilir.
   */
  function scopeFor(ownerTaxId: string): string {
    return config.scopeId ?? ownerTaxId;
  }

  function headers(input: { ownerTaxId: string; idempotencyKey?: string }): Record<string, string> {
    // Başlık kümesi ölçüldü: mimkit `dist/core.js:57-85`.
    const result: Record<string, string> = {
      authorization: `Bearer ${config.token}`,
      'x-request-id': randomUUID(),
      accept: 'application/json',
      'content-type': 'application/json',
      'x-owner-tax-id': input.ownerTaxId,
      'x-client-ref': 'mimmock',
    };
    // scope YALNIZ verilmişse gider; scope'suz uygulamada varlığı 400'dür.
    // Bu uygulamada scope ZORUNLU — canlı ölçüldü: eksikse 400 `SCOPE_REQUIRED`.
    result['x-scope-id'] = scopeFor(input.ownerTaxId);
    if (input.idempotencyKey) result['idempotency-key'] = input.idempotencyKey;
    return result;
  }

  return {
    async health() {
      try {
        const response = await fetchImpl(`${base}/healthz`, {
          signal: AbortSignal.timeout(Math.min(config.timeoutMs, 5000)),
        });
        // 401/403 de "ayakta" sayılır: servis var, kimlik ayrı mesele.
        return response.status < 500;
      } catch {
        return false;
      }
    },

    async listSeries(ownerTaxId) {
      const response = await fetchImpl(`${base}/v1/series`, { headers: headers({ ownerTaxId }) });
      if (!response.ok) {
        throw new NumberingUnavailableError(`seri listesi alınamadı (${response.status})`);
      }
      const payload = (await response.json()) as { items?: unknown };
      const items = Array.isArray(payload.items) ? payload.items : [];
      return items.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const e = entry as Record<string, unknown>;
        return [
          {
            id: String(e.id ?? ''),
            prefix: String(e.prefix ?? ''),
            docType: String(e.docType ?? ''),
            isDefault: e.isDefault === true,
            active: e.active !== false,
          },
        ];
      });
    },

    async createSeries(input) {
      const response = await fetchImpl(`${base}/v1/series`, {
        method: 'POST',
        headers: headers({ ownerTaxId: input.ownerTaxId }),
        body: JSON.stringify({
          prefix: input.prefix,
          docType: input.docType,
          name: input.name ?? `MimMock ${input.prefix} serisi`,
        }),
      });
      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok) {
        const error = (payload?.error ?? payload) as Record<string, unknown> | undefined;
        throw new NumberingRejectedError(
          typeof error?.message === 'string' ? error.message : response.statusText,
          response.status,
          typeof error?.code === 'string' ? error.code : undefined,
        );
      }
      return {
        id: String(payload?.id ?? ''),
        prefix: String(payload?.prefix ?? input.prefix),
        docType: String(payload?.docType ?? input.docType),
        isDefault: payload?.isDefault === true,
        active: payload?.active !== false,
      };
    },

    async resolveSeriesId({ ownerTaxId, prefix, docType }) {
      const cacheKey = `${ownerTaxId}|${scopeFor(ownerTaxId)}|${prefix}|${docType}`;
      const cached = seriesCache.get(cacheKey);
      if (cached) return cached;

      const existing = (await this.listSeries(ownerTaxId)).find(
        (s) => s.prefix === prefix && s.docType === docType && s.active,
      );
      const series = existing ?? (await this.createSeries({ ownerTaxId, prefix, docType }));
      seriesCache.set(cacheKey, series.id);
      return series.id;
    },

    async reserve(input) {
      const body: Record<string, unknown> = { date: input.date };
      if (input.seriesId) body.seriesId = input.seriesId;
      if (input.docType) body.docType = input.docType;

      let response: Response;
      try {
        response = await fetchImpl(`${base}/v1/numbers/reserve`, {
          method: 'POST',
          headers: headers(input),
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(config.timeoutMs),
        });
      } catch (error) {
        throw new NumberingUnavailableError(
          `numaratör erişilemez: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }

      if (response.status >= 500 || response.status === 408 || response.status === 429) {
        throw new NumberingUnavailableError(`numaratör ${response.status} döndü`);
      }

      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;

      if (!response.ok) {
        // Hata gövdesi ÖLÇÜLDÜ (canlı kittest, 2026-09-22):
        //   { "error": { "code": "...", "message": "..." }, "requestId": "..." }
        // Düz `{code,message}` beklemek kodu `undefined` bırakıyordu — kapının
        // hangi sebeple kapandığı görünmez oluyordu.
        const error = (payload?.error ?? payload) as Record<string, unknown> | undefined;
        const code = typeof error?.code === 'string' ? error.code : undefined;
        const message =
          typeof error?.message === 'string' ? error.message : response.statusText;
        throw new NumberingRejectedError(message, response.status, code);
      }

      const data = (payload?.data ?? payload) as Record<string, unknown> | null;
      const number = typeof data?.number === 'string' ? data.number : null;
      if (!data || number === null) {
        throw new NumberingUnavailableError('numaratör yanıtında `number` yok');
      }
      const series = (data.series ?? {}) as Record<string, unknown>;

      return {
        reservationId: typeof data.reservationId === 'string' ? data.reservationId : '',
        number,
        seriesId: typeof series.id === 'string' ? series.id : undefined,
        seriesPrefix: typeof series.prefix === 'string' ? series.prefix : undefined,
        // Ölçüldü: 200 = replay, 201 = yeni numara.
        replayed: response.status === 200,
      };
    },
  };
}
