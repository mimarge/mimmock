/**
 * Görüntü (render) istemcisi — plan §1 "Şablon/görüntü: GERÇEK, mimkit-test" ve M7.
 *
 * Sözleşme ÖLÇÜLDÜ (`@mimarge/mimkit@0.8.0` `dist/tools.js`, `dist/types.d.ts`):
 *
 * ```
 * POST {base}/v1/transform
 *   body: { source: { xmlBase64 }, <şablon kaynağı>, output: 'html' | 'pdf' }
 *   Accept: application/json  → { htmlBase64 | pdfBase64, templateUsed, watermarkApplied }
 *   Accept: application/pdf   → HAM baytlar (base64 çözme maliyeti yok)
 * ```
 *
 * Şablon kaynağı BEŞ yoldan verilebilir; mock ikisini kullanır:
 *   - `template: { id, version, docType }` → şirketin SEÇTİĞİ şablon (sürüm sabitli)
 *   - `resolve: { docType }` → mükellef/scope basamağı, yoksa sistem varsayılanı
 *
 * ⚠️ Ölçülmüş tuzak (`types.d.ts:585-590`): `template` verilirken `docType`
 * İSTEĞE BAĞLIDIR ama bir AİDİYET beyanıdır. Verilmezse tür şablondan okunur —
 * yani e-Fatura çizdirip e-Arşiv şablonunun id'sini vermek **sessizce** e-Arşiv
 * görünümü üretir. Mock `docType`'ı HER ZAMAN gönderir; sessiz yanlış görüntü
 * tam da sandbox'ın önlemesi gereken şeydir.
 */
import { randomUUID } from 'node:crypto';

export interface RenderConfig {
  url: string;
  token: string;
  scopeId: string | undefined;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

export interface TemplateRef {
  id: string;
  version: number;
}

export interface RenderInput {
  xml: string;
  docType: string;
  /** Mükellefin VKN'si — `template`/`resolve` yollarında zorunlu. */
  ownerTaxId: string;
  /** Şirket bir şablon seçtiyse; yoksa `resolve` yoluna düşülür. */
  template?: TemplateRef | undefined;
}

export interface RenderedHtml {
  html: string;
  templateUsed: TemplateRef | null;
  watermarkApplied: boolean;
}

export interface RenderedPdf {
  bytes: Buffer;
}

export interface TemplateSummary {
  id: string;
  name: string;
  docType: string;
  version: number;
  isDefault: boolean;
}

/** Görüntü servisi erişilemez / 5xx → `TEMPLATE_UNAVAILABLE` (503). */
export class RenderUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RenderUnavailableError';
  }
}

/** Şablon/istek reddi (4xx) — `TEMPLATE_REJECTED` / `TEMPLATE_NOT_FOUND`. */
export class RenderRejectedError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  constructor(message: string, status: number, code: string | undefined) {
    super(message);
    this.name = 'RenderRejectedError';
    this.status = status;
    this.code = code;
  }
}

export interface Renderer {
  html(input: RenderInput): Promise<RenderedHtml>;
  pdf(input: RenderInput): Promise<RenderedPdf>;
  listTemplates(ownerTaxId: string): Promise<TemplateSummary[]>;
}

export function createRenderer(config: RenderConfig): Renderer {
  const fetchImpl = config.fetchImpl ?? globalThis.fetch;
  const base = config.url.replace(/\/+$/, '');

  function headers(ownerTaxId: string, accept: string): Record<string, string> {
    const result: Record<string, string> = {
      authorization: `Bearer ${config.token}`,
      'x-request-id': randomUUID(),
      accept,
      'content-type': 'application/json',
      'x-owner-tax-id': ownerTaxId,
      'x-client-ref': 'mimmock',
    };
    // Bu uygulamada scope zorunlu (canlı ölçüm, M2 §4b).
    result['x-scope-id'] = config.scopeId ?? ownerTaxId;
    return result;
  }

  /** Şablon kaynağını kurar — seçim varsa sürüm sabitli, yoksa çözümleme. */
  function templateSource(input: RenderInput): Record<string, unknown> {
    if (input.template) {
      return {
        template: {
          id: input.template.id,
          version: input.template.version,
          // ⚠️ Aidiyet beyanı: eşleşmezse `400 TEMPLATE_DOCTYPE_MISMATCH`.
          // Göndermemek sessiz yanlış görüntü riskidir.
          docType: input.docType,
        },
      };
    }
    return { resolve: { docType: input.docType } };
  }

  async function post(input: RenderInput, output: 'html' | 'pdf', accept: string): Promise<Response> {
    const body = JSON.stringify({
      source: { xmlBase64: Buffer.from(input.xml, 'utf8').toString('base64') },
      ...templateSource(input),
      output,
    });
    try {
      return await fetchImpl(`${base}/v1/transform`, {
        method: 'POST',
        headers: headers(input.ownerTaxId, accept),
        body,
        signal: AbortSignal.timeout(config.timeoutMs),
      });
    } catch (error) {
      throw new RenderUnavailableError(
        `görüntü servisi erişilemez: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  async function assertOk(response: Response): Promise<void> {
    if (response.ok) return;
    if (response.status >= 500 || response.status === 408 || response.status === 429) {
      throw new RenderUnavailableError(`görüntü servisi ${response.status} döndü`);
    }
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    const error = (payload?.error ?? payload) as Record<string, unknown> | undefined;
    throw new RenderRejectedError(
      typeof error?.message === 'string' ? error.message : response.statusText,
      response.status,
      typeof error?.code === 'string' ? error.code : undefined,
    );
  }

  return {
    async html(input) {
      const response = await post(input, 'html', 'application/json');
      await assertOk(response);
      const payload = (await response.json()) as Record<string, unknown>;
      const htmlBase64 = typeof payload.htmlBase64 === 'string' ? payload.htmlBase64 : null;
      if (htmlBase64 === null) {
        throw new RenderUnavailableError('görüntü servisi yanıtında `htmlBase64` yok');
      }
      const used = payload.templateUsed as { id?: unknown; version?: unknown } | undefined;
      return {
        html: Buffer.from(htmlBase64, 'base64').toString('utf8'),
        templateUsed:
          used && typeof used.id === 'string' && typeof used.version === 'number'
            ? { id: used.id, version: used.version }
            : null,
        watermarkApplied: payload.watermarkApplied === true,
      };
    },

    async pdf(input) {
      // Ham baytlar: base64 çözme maliyeti ödenmez (ölçülmüş tercih).
      const response = await post(input, 'pdf', 'application/pdf');
      await assertOk(response);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0) throw new RenderUnavailableError('görüntü servisi boş PDF döndü');
      return { bytes };
    },

    async listTemplates(ownerTaxId) {
      let response: Response;
      try {
        response = await fetchImpl(`${base}/v1/templates`, {
          headers: headers(ownerTaxId, 'application/json'),
          signal: AbortSignal.timeout(config.timeoutMs),
        });
      } catch (error) {
        throw new RenderUnavailableError(
          `şablon listesi alınamadı: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
      await assertOk(response);
      const payload = (await response.json()) as { items?: unknown };
      const items = Array.isArray(payload.items) ? payload.items : [];
      return items.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const e = entry as Record<string, unknown>;
        return [
          {
            id: String(e.id ?? ''),
            name: String(e.name ?? ''),
            docType: String(e.docType ?? ''),
            version: Number(e.latestVersion ?? e.version ?? 1),
            isDefault: e.isDefault === true,
          },
        ];
      });
    },
  };
}
