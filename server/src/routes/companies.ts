/**
 * `/v1/companies` — plan §4.
 * Panel de aynı uçları kullanır; ikinci bir yönetim yüzeyi YOKTUR (kopya yok).
 */
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { MimMockError } from '../errors.js';
import { assertTaxIdentifier, parseCompanyInput } from '../validation.js';
import type { CompanyRow } from '../db/repo.js';
import type { AppDeps } from '../deps.js';

/** Dış temsil — DB satırı doğrudan sızdırılmaz. */
export function serializeCompany(row: CompanyRow) {
  return {
    vkn: row.vkn,
    title: row.title,
    address: {
      street: row.addressStreet,
      district: row.addressDistrict,
      city: row.addressCity,
      country: row.addressCountry,
      taxOffice: row.taxOffice,
    },
    aliases: { pk: row.pkAliases, gb: row.gbAliases },
    profiles: row.profiles,
    templateId: row.templateId,
    seriesPrefix: row.seriesPrefix,
    eInvoiceRegistered: row.eInvoiceRegistered,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function registerCompanyRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { repo } = deps;

  app.get('/v1/companies', async (request) => {
    const auth = await request.authenticate();
    const rows = await repo.listCompanies(auth.tenant.id);
    return { companies: rows.map(serializeCompany) };
  });

  app.get<{ Params: { vkn: string } }>('/v1/companies/:vkn', async (request) => {
    const auth = await request.authenticate();
    const vkn = assertTaxIdentifier(request.params.vkn);
    const row = await repo.findCompany(auth.tenant.id, vkn);
    if (!row) throw new MimMockError('COMPANY_NOT_FOUND');
    return serializeCompany(row);
  });

  app.post('/v1/companies', async (request, reply) => {
    const auth = await request.authenticate();
    const input = parseCompanyInput(request.body);

    const existing = await repo.findCompany(auth.tenant.id, input.vkn);
    if (existing) throw new MimMockError('COMPANY_EXISTS');

    const row = await repo.insertCompany({
      id: `co_${randomUUID()}`,
      tenantId: auth.tenant.id,
      vkn: input.vkn,
      title: input.title,
      addressStreet: input.addressStreet ?? null,
      addressDistrict: input.addressDistrict ?? null,
      addressCity: input.addressCity ?? null,
      addressCountry: input.addressCountry,
      taxOffice: input.taxOffice ?? null,
      pkAliases: input.pkAliases,
      gbAliases: input.gbAliases,
      profiles: input.profiles,
      templateId: input.templateId ?? null,
      seriesPrefix: input.seriesPrefix ?? null,
      eInvoiceRegistered: input.eInvoiceRegistered,
    });

    reply.code(201);
    return serializeCompany(row);
  });
}
