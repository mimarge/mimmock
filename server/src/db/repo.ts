/**
 * Sorgu katmanı — TEK gövde, iki sürücü.
 *
 * Burada lehçe adı geçmez. `client.ts` hangi sürücüyü açtıysa aynı kod koşar;
 * `dual-driver` testi ikisinde de aynı sonucu verdiğini ölçer.
 */
import { and, eq, asc, desc, count, type SQL } from 'drizzle-orm';
import type { DbHandle } from './client.js';
import * as schema from './dialects/sqlite.generated.js';

export type TenantRow = typeof schema.tenants.$inferSelect;
export type TenantInsert = typeof schema.tenants.$inferInsert;
export type CompanyRow = typeof schema.companies.$inferSelect;
export type CompanyInsert = typeof schema.companies.$inferInsert;
export type DocumentRow = typeof schema.documents.$inferSelect;
export type WebhookRow = typeof schema.webhooks.$inferSelect;
export type WebhookInsert = typeof schema.webhooks.$inferInsert;
export type WebhookDeliveryRow = typeof schema.webhook_deliveries.$inferSelect;
export type DocumentInsert = typeof schema.documents.$inferInsert;

export interface DocumentFilter {
  direction?: string | undefined;
  status?: string | undefined;
  type?: string | undefined;
  companyId?: string | undefined;
  limit: number;
  offset: number;
}

export interface Repo {
  findTenantByApiKey(apiKey: string): Promise<TenantRow | null>;
  findTenantById(id: string): Promise<TenantRow | null>;
  listTenants(): Promise<TenantRow[]>;
  insertTenant(row: TenantInsert): Promise<TenantRow>;

  listCompanies(tenantId: string): Promise<CompanyRow[]>;
  findCompany(tenantId: string, vkn: string): Promise<CompanyRow | null>;
  insertCompany(row: CompanyInsert): Promise<CompanyRow>;
  updateCompany(tenantId: string, vkn: string, patch: Partial<CompanyInsert>): Promise<CompanyRow | null>;

  insertDocument(row: DocumentInsert): Promise<DocumentRow>;
  findDocumentById(tenantId: string, id: string): Promise<DocumentRow | null>;
  findDocumentByEttn(tenantId: string, ettn: string, direction: string): Promise<DocumentRow | null>;
  findDocumentByNumber(
    tenantId: string,
    senderVkn: string,
    documentNumber: string,
  ): Promise<DocumentRow | null>;
  findCompanyById(tenantId: string, id: string): Promise<CompanyRow | null>;
  insertWebhook(row: WebhookInsert): Promise<WebhookRow>;
  findDocumentBySource(tenantId: string, sourceDocumentId: string): Promise<DocumentRow | null>;
  listDocuments(tenantId: string, filter: DocumentFilter): Promise<DocumentRow[]>;
  countDocuments(tenantId: string, filter: DocumentFilter): Promise<number>;
}

export function createRepo(handle: DbHandle): Repo {
  const { db, tables } = handle;

  return {
    async findTenantByApiKey(apiKey) {
      const rows = await db.select().from(tables.tenants).where(eq(tables.tenants.apiKey, apiKey)).limit(1);
      return rows[0] ?? null;
    },

    async findTenantById(id) {
      const rows = await db.select().from(tables.tenants).where(eq(tables.tenants.id, id)).limit(1);
      return rows[0] ?? null;
    },

    async listTenants() {
      return db.select().from(tables.tenants).orderBy(asc(tables.tenants.createdAt));
    },

    async insertTenant(row) {
      const inserted = await db.insert(tables.tenants).values(row).returning();
      const created = inserted[0];
      if (!created) throw new Error('tenant yazılamadı');
      return created;
    },

    async listCompanies(tenantId) {
      return db
        .select()
        .from(tables.companies)
        .where(eq(tables.companies.tenantId, tenantId))
        .orderBy(asc(tables.companies.createdAt));
    },

    async findCompany(tenantId, vkn) {
      const rows = await db
        .select()
        .from(tables.companies)
        .where(and(eq(tables.companies.tenantId, tenantId), eq(tables.companies.vkn, vkn)))
        .limit(1);
      return rows[0] ?? null;
    },

    async insertCompany(row) {
      const inserted = await db.insert(tables.companies).values(row).returning();
      const created = inserted[0];
      if (!created) throw new Error('company yazılamadı');
      return created;
    },

    async updateCompany(tenantId, vkn, patch) {
      const updated = await db
        .update(tables.companies)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(tables.companies.tenantId, tenantId), eq(tables.companies.vkn, vkn)))
        .returning();
      return updated[0] ?? null;
    },

    async insertDocument(row) {
      const inserted = await db.insert(tables.documents).values(row).returning();
      const created = inserted[0];
      if (!created) throw new Error('document yazılamadı');
      return created;
    },

    async findDocumentById(tenantId, id) {
      const rows = await db
        .select()
        .from(tables.documents)
        .where(and(eq(tables.documents.tenantId, tenantId), eq(tables.documents.id, id)))
        .limit(1);
      return rows[0] ?? null;
    },

    async findDocumentByEttn(tenantId, ettn, direction) {
      const rows = await db
        .select()
        .from(tables.documents)
        .where(
          and(
            eq(tables.documents.tenantId, tenantId),
            eq(tables.documents.ettn, ettn),
            eq(tables.documents.direction, direction),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    },

    async findDocumentByNumber(tenantId, senderVkn, documentNumber) {
      const rows = await db
        .select()
        .from(tables.documents)
        .where(
          and(
            eq(tables.documents.tenantId, tenantId),
            eq(tables.documents.senderVkn, senderVkn),
            eq(tables.documents.documentNumber, documentNumber),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    },

    async findCompanyById(tenantId, id) {
      const rows = await db
        .select()
        .from(tables.companies)
        .where(and(eq(tables.companies.tenantId, tenantId), eq(tables.companies.id, id)))
        .limit(1);
      return rows[0] ?? null;
    },

    async insertWebhook(row) {
      const inserted = await db.insert(tables.webhooks).values(row).returning();
      const created = inserted[0];
      if (!created) throw new Error('webhook yazılamadı');
      return created;
    },

    async findDocumentBySource(tenantId, sourceDocumentId) {
      const rows = await db
        .select()
        .from(tables.documents)
        .where(
          and(
            eq(tables.documents.tenantId, tenantId),
            eq(tables.documents.sourceDocumentId, sourceDocumentId),
          ),
        )
        .limit(1);
      return rows[0] ?? null;
    },

    async listDocuments(tenantId, filter) {
      return db
        .select()
        .from(tables.documents)
        .where(documentWhere(tables, tenantId, filter))
        .orderBy(desc(tables.documents.createdAt))
        .limit(filter.limit)
        .offset(filter.offset);
    },

    async countDocuments(tenantId, filter) {
      const rows = await db
        .select({ value: count() })
        .from(tables.documents)
        .where(documentWhere(tables, tenantId, filter));
      return rows[0]?.value ?? 0;
    },
  };
}

/** Süzgeç — listeleme ve sayım aynı koşulu paylaşır (kopya yok). */
function documentWhere(
  tables: DbHandle['tables'],
  tenantId: string,
  filter: DocumentFilter,
): SQL | undefined {
  const conditions: SQL[] = [eq(tables.documents.tenantId, tenantId)];
  if (filter.direction) conditions.push(eq(tables.documents.direction, filter.direction));
  if (filter.status) conditions.push(eq(tables.documents.status, filter.status));
  if (filter.type) conditions.push(eq(tables.documents.type, filter.type));
  if (filter.companyId) conditions.push(eq(tables.documents.companyId, filter.companyId));
  return and(...conditions);
}
