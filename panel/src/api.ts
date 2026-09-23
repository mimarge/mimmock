import type { HealthResponse } from '@shared/routes/health';

/**
 * Panelin API istemcisi.
 * Panel, geliştiricinin kullandığı AYNI uçları çağırır (plan §4) — ayrı bir
 * yönetim yüzeyi yoktur, yani panelde görünen her şey API'den de elde edilebilir.
 */
/** Sunucunun kendi tipi — kopya yok; şekil değişirse panel derlenmez. */
export type Health = HealthResponse;

export interface Company {
  vkn: string;
  title: string;
  address: {
    street: string | null;
    district: string | null;
    city: string | null;
    country: string;
    taxOffice: string | null;
  };
  aliases: { pk: string[]; gb: string[] };
  profiles: string[];
  templateId: string | null;
  seriesPrefix: string | null;
  eInvoiceRegistered: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MockDocument {
  id: string;
  ettn: string;
  direction: string;
  type: string;
  profile: string | null;
  typeCode: string | null;
  status: string;
  rawGibCode: number | null;
  replyStatus: string;
  documentNumber: string | null;
  issueDate: string;
  senderVkn: string | null;
  receiverVkn: string | null;
  currencyCode: string | null;
  payableAmount: string | null;
  sourceKind: string;
  generated: boolean;
  generatedScenario: string | null;
  validation: { appliedXsd: string | null; appliedSchematron: string | null };
  deliveredAt: string | null;
  signature: { kind: string | null; signedAt: string | null; chainValid: boolean };
  engine: { scenario: string | null; nextState: string | null; nextAt: string | null };
  createdAt: string;
}

export interface Scenario {
  name: string;
  description: string;
  steps: Array<{ event: string; rawGibCode: number | null; delayMs: number; alarm: string | null; note: string | null }>;
  endsOpen: boolean;
}

export interface Webhook {
  id: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
}

export interface Delivery {
  id: string;
  webhookId: string;
  sequence: number;
  event: string;
  documentId: string | null;
  documentVersion: number | null;
  status: string;
  attempt: number;
  maxAttempts: number;
  httpStatus: number | null;
  error: string | null;
  nextAttemptAt: string | null;
  deliveredAt: string | null;
}

export interface SinkEvent {
  id: string;
  receivedAt: string;
  event: string;
  sequence: number | null;
  signatureValid: boolean;
  signatureError: string | null;
}

export interface InboxDocument {
  id: string;
  ettn: string;
  type: string;
  profile: string | null;
  status: string;
  replyStatus: string;
  replyDecision: string | null;
  replyReason: string | null;
  documentNumber: string | null;
  senderVkn: string | null;
  payableAmount: string | null;
  currencyCode: string | null;
  systemResponse: { sentAt: string | null; confirmedAt: string | null; code: number | null };
  replyable: { can: boolean; reason: string | null };
  sourceDocumentId: string | null;
  /** 🔑 Trafik üretecinin ürettiği mi (plan §5b) — kendi trafiğinizle karışmasın. */
  generated: boolean;
  generatedScenario: string | null;
}

/** Ham istek günlüğü kaydı — plan §8'in 🔑 maddesi. */
export interface RequestLogEntry {
  id: string;
  at: string;
  method: string;
  url: string;
  status: number;
  durationMs: number;
  errorCode: string | null;
  companyVkn: string | null;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  responseBody: string | null;
}

/** Belge olay geçmişi satırı — "neden bu duruma geldi". */
export interface DocumentEvent {
  at: string;
  /** Sözlükteki geçiş satırı (G5…G16, L10, L11) — izlenebilirliğin çıpası. */
  ruleId: string;
  axis: string;
  from: string | null;
  to: string | null;
  rawGibCode: number | null;
  alarm: string | null;
  documentVersion: number | null;
}

export interface ApiError {
  errorCode: string;
  reason: string;
  errors?: Array<{ field: string; reason: string }>;
}

const TOKEN_KEY = 'mimmock.panelToken';

export function getPanelToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? 'local';
}

export function setPanelToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-panel-token': getPanelToken(),
      ...(init?.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body ?? { errorCode: 'UNKNOWN', reason: response.statusText }) as ApiError;
    throw error;
  }
  return body as T;
}

export const api = {
  health: () => request<Health>('/healthz'),
  listCompanies: () => request<{ companies: Company[] }>('/v1/companies'),
  createCompany: (payload: unknown) =>
    request<Company>('/v1/companies', { method: 'POST', body: JSON.stringify(payload) }),
  /**
   * GİDEN tahtası. ⚠️ Yön süzgeci ŞART: `/v1/documents` her iki yönü döndürür ve
   * süzgeçsiz çağrı gelen belgeleri GİDEN tahtasına basardı — canlı ölçümde
   * yakalandı (trafik üreteci yalnız gelen üretiyor, tahta 12 sahte giden gösterdi).
   */
  listDocuments: () =>
    request<{ documents: MockDocument[]; page: { total: number } }>(
      '/v1/documents?direction=OUTBOUND&limit=25',
    ),
  listScenarios: () => request<{ scenarios: Scenario[] }>('/v1/_sandbox/scenarios'),
  advance: (id: string) =>
    request<{ status: string }>(`/v1/_sandbox/documents/${id}/advance`, { method: 'POST' }),
  injectFailure: (id: string, rawGibCode: number) =>
    request<{ status: string; note?: string }>(`/v1/_sandbox/documents/${id}/fail`, {
      method: 'POST',
      body: JSON.stringify({ rawGibCode }),
    }),
  listWebhooks: () =>
    request<{ webhooks: Webhook[]; retryPolicy: { delaysMs: number[]; maxAttempts: number } }>(
      '/v1/webhooks',
    ),
  listDeliveries: (webhookId: string) =>
    request<{ deliveries: Delivery[] }>(`/v1/webhooks/${webhookId}/deliveries`),
  replayDelivery: (webhookId: string, deliveryId: string) =>
    request<Delivery>(`/v1/webhooks/${webhookId}/replay`, {
      method: 'POST',
      body: JSON.stringify({ deliveryId }),
    }),
  listSinkEvents: () => request<{ events: SinkEvent[] }>('/v1/_sandbox/webhook-sink'),
  generateTraffic: () =>
    request<{ produced: number; duplicate: number; rejected: number }>('/v1/_sandbox/traffic', {
      method: 'POST',
    }),
  listInbox: () => request<{ inbox: InboxDocument[] }>('/v1/inbox'),
  /**
   * Görüntüyü YENİ SEKMEDE açar.
   *
   * ⚠️ Düz bir `<a href>` ÇALIŞMAZ: tarayıcı o isteğe `Authorization` /
   * `X-Panel-Token` başlığını eklemez ve uç 401 döner. Bu kusur canlı denemede
   * yakalandı. Doğru yol: fetch ile al, blob URL üret, onu aç.
   */
  openRender: async (id: string, kind: 'html' | 'pdf') => {
    const response = await fetch(`/v1/documents/${id}/${kind}`, {
      headers: { 'x-panel-token': getPanelToken() },
    });
    if (!response.ok) {
      throw (await response.json().catch(() => ({
        errorCode: 'UNKNOWN',
        reason: response.statusText,
      }))) as ApiError;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    // Sekme açıldıktan sonra bırak; erken iptal boş sayfa gösterirdi.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
  reply: (id: string, decision: 'ACCEPTED' | 'REJECTED', reason?: string) =>
    request<InboxDocument>(`/v1/inbox/${id}/reply`, {
      method: 'POST',
      body: JSON.stringify({ decision, reason }),
    }),
  advanceClock: (payload: { advanceMs?: number; advanceDays?: number; reset?: boolean }) =>
    request<{ now: string; offsetMs: number }>('/v1/_sandbox/clock', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  /** Sanal saatin okunması — tahtanın iki saatinden biri. */
  readClock: () =>
    request<{ now: string; offsetMs: number; real: string }>('/v1/_sandbox/clock'),
  listRequests: (limit = 60) =>
    request<{ requests: RequestLogEntry[] }>(`/v1/_sandbox/requests?limit=${limit}`),
  documentHistory: (id: string) =>
    request<{ events: DocumentEvent[] }>(`/v1/documents/${id}/history`),
};

/**
 * ProfileID kümesi — sunucudaki TEK KAYNAKTAN gelir (`server/src/profiles.ts`),
 * panelde KOPYALANMAZ. `@shared` diğer adı `vite.config.ts`'te tanımlı.
 */
export { INVOICE_PROFILE_IDS, type InvoiceProfileId } from '@shared/profiles';
