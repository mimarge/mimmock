/**
 * Kimlik — plan K5 ve K14.
 *
 * K5: `Authorization: Bearer <kiracı anahtarı>` + `X-Company: <VKN>`.
 *     Anahtar kiracıyı (muhasebe yazılımını), `X-Company` mükellefi seçer.
 *     MimForge'un gerçek modeli tenant→branch; tek anahtarla yüzlerce müşteri.
 * K14: Panel kimliği env'den TEK token (`MIMMOCK_PANEL_TOKEN`). Panel bütün
 *     kiracıları görebilir; kiracı `X-Tenant` ile seçilir, tek kiracı varsa o.
 *     Token ayarlı değilse yerel sandbox açıktır — sessiz değil, `/healthz`
 *     bunu `panelTokenRequired: false` diye söyler.
 */
import type { FastifyRequest } from 'fastify';
import { MimMockError } from './errors.js';
import type { Repo, TenantRow, CompanyRow } from './db/repo.js';
import type { AppConfig } from './config.js';
import { isValidTaxIdentifier } from './validation.js';

export interface AuthContext {
  tenant: TenantRow;
  /** `X-Company` verilmişse çözülmüş mükellef; verilmemişse null. */
  company: CompanyRow | null;
  /** Panel token'ıyla mı gelindi (yönetici kapsamı). */
  viaPanel: boolean;
}

function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (typeof header !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

function headerValue(request: FastifyRequest, name: string): string | null {
  const raw = request.headers[name];
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

async function resolvePanelTenant(request: FastifyRequest, repo: Repo): Promise<TenantRow> {
  const selector = headerValue(request, 'x-tenant');
  if (selector) {
    const byId = await repo.findTenantById(selector);
    if (byId) return byId;
    const byKey = await repo.findTenantByApiKey(selector);
    if (byKey) return byKey;
    throw new MimMockError('INVALID_API_KEY', { reason: 'X-Tenant ile verilen kiracı yok.' });
  }
  const tenants = await repo.listTenants();
  const only = tenants[0];
  if (!only) throw new MimMockError('INVALID_API_KEY', { reason: 'Tanımlı kiracı yok.' });
  if (tenants.length > 1) throw new MimMockError('TENANT_AMBIGUOUS');
  return only;
}

export async function authenticate(
  request: FastifyRequest,
  repo: Repo,
  config: AppConfig,
): Promise<AuthContext> {
  const panelToken = headerValue(request, 'x-panel-token');
  let tenant: TenantRow;
  let viaPanel = false;

  if (panelToken !== null) {
    // Token ayarlıysa eşleşmeli; ayarlı değilse yerel sandbox açık (K14).
    if (config.panelToken !== undefined && panelToken !== config.panelToken) {
      throw new MimMockError('INVALID_API_KEY', { reason: 'Panel token geçersiz.' });
    }
    tenant = await resolvePanelTenant(request, repo);
    viaPanel = true;
  } else {
    const apiKey = bearerToken(request);
    if (apiKey === null) throw new MimMockError('MISSING_API_KEY');
    const found = await repo.findTenantByApiKey(apiKey);
    if (!found) throw new MimMockError('INVALID_API_KEY');
    tenant = found;
  }

  const companyHeader = headerValue(request, 'x-company');
  let company: CompanyRow | null = null;
  if (companyHeader !== null) {
    if (!isValidTaxIdentifier(companyHeader)) throw new MimMockError('INVALID_VKN');
    company = await repo.findCompany(tenant.id, companyHeader);
    if (!company) throw new MimMockError('CONTEXT');
  }

  return { tenant, company, viaPanel };
}

/** `X-Company` zorunlu olan uçlar için — M2'den itibaren belge uçları kullanır. */
export function requireCompany(auth: AuthContext): CompanyRow {
  if (!auth.company) throw new MimMockError('BRANCH_REQUIRED');
  return auth.company;
}
