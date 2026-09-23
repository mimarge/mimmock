// ÜRETİLMİŞ DOSYA — elle düzenlemeyin.
// Kaynak: src/db/spec.ts · Üretici: src/db/codegen.ts
// Güncellemek için: pnpm db:codegen

import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const tenants = sqliteTable('tenants', {
  id: text('id').primaryKey(),
  apiKey: text('api_key').notNull().unique(),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
});

export const companies = sqliteTable('companies', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  vkn: text('vkn').notNull(),
  title: text('title').notNull(),
  addressStreet: text('address_street'),
  addressDistrict: text('address_district'),
  addressCity: text('address_city'),
  addressCountry: text('address_country').notNull(),
  taxOffice: text('tax_office'),
  pkAliases: text('pk_aliases', { mode: 'json' }).$type<string[]>().notNull(),
  gbAliases: text('gb_aliases', { mode: 'json' }).$type<string[]>().notNull(),
  profiles: text('profiles', { mode: 'json' }).$type<string[]>().notNull(),
  templateId: text('template_id'),
  seriesPrefix: text('series_prefix'),
  eInvoiceRegistered: integer('e_invoice_registered', { mode: 'boolean' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  uniqueIndex('companies_tenant_id_vkn_uq').on(t.tenantId, t.vkn),
  index('companies_tenant_id_idx').on(t.tenantId),
]);

export const documents = sqliteTable('documents', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  companyId: text('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
  ettn: text('ettn').notNull(),
  direction: text('direction').notNull(),
  type: text('type').notNull(),
  profile: text('profile'),
  typeCode: text('type_code'),
  status: text('status').notNull(),
  rawGibCode: integer('raw_gib_code'),
  replyStatus: text('reply_status').notNull(),
  documentNumber: text('document_number'),
  issueDate: text('issue_date').notNull(),
  senderVkn: text('sender_vkn'),
  receiverVkn: text('receiver_vkn'),
  currencyCode: text('currency_code'),
  payableAmount: text('payable_amount'),
  ublXml: text('ubl_xml').notNull(),
  sourceJson: text('source_json', { mode: 'json' }).$type<unknown>(),
  sourceKind: text('source_kind').notNull(),
  appliedXsd: text('applied_xsd'),
  appliedSchematron: text('applied_schematron'),
  numberReservationId: text('number_reservation_id'),
  signatureKind: text('signature_kind'),
  signedAt: integer('signed_at', { mode: 'timestamp_ms' }),
  srSentAt: integer('sr_sent_at', { mode: 'timestamp_ms' }),
  srConfirmedAt: integer('sr_confirmed_at', { mode: 'timestamp_ms' }),
  srCode: integer('sr_code'),
  replyDecision: text('reply_decision'),
  replyReason: text('reply_reason'),
  replyAt: integer('reply_at', { mode: 'timestamp_ms' }),
  replyDeadlineAt: integer('reply_deadline_at', { mode: 'timestamp_ms' }),
  sourceDocumentId: text('source_document_id'),
  generated: integer('generated', { mode: 'boolean' }).notNull(),
  generatedScenario: text('generated_scenario'),
  scenario: text('scenario'),
  nextState: text('next_state'),
  nextAt: integer('next_at', { mode: 'timestamp_ms' }),
  deliveredAt: integer('delivered_at', { mode: 'timestamp_ms' }),
  version: integer('version').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  uniqueIndex('documents_tenant_id_direction_ettn_uq').on(t.tenantId, t.direction, t.ettn),
  index('documents_company_id_idx').on(t.companyId),
  index('documents_tenant_id_direction_idx').on(t.tenantId, t.direction),
  index('documents_status_idx').on(t.status),
]);

export const webhooks = sqliteTable('webhooks', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  companyId: text('company_id'),
  url: text('url').notNull(),
  secret: text('secret').notNull(),
  events: text('events', { mode: 'json' }).$type<string[]>().notNull(),
  active: integer('active', { mode: 'boolean' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  index('webhooks_tenant_id_idx').on(t.tenantId),
]);

export const webhook_deliveries = sqliteTable('webhook_deliveries', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  webhookId: text('webhook_id').notNull().references(() => webhooks.id, { onDelete: 'cascade' }),
  sequence: integer('sequence').notNull(),
  eventType: text('event_type').notNull(),
  documentId: text('document_id'),
  documentVersion: integer('document_version'),
  payload: text('payload', { mode: 'json' }).$type<unknown>().notNull(),
  status: text('status').notNull(),
  attempt: integer('attempt').notNull(),
  httpStatus: integer('http_status'),
  error: text('error'),
  nextAttemptAt: integer('next_attempt_at', { mode: 'timestamp_ms' }),
  deliveredAt: integer('delivered_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  index('webhook_deliveries_tenant_id_idx').on(t.tenantId),
  index('webhook_deliveries_webhook_id_idx').on(t.webhookId),
  index('webhook_deliveries_status_idx').on(t.status),
]);

export const webhook_sink_events = sqliteTable('webhook_sink_events', {
  id: text('id').primaryKey(),
  receivedAt: integer('received_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  eventType: text('event_type').notNull(),
  sequence: integer('sequence'),
  signatureValid: integer('signature_valid', { mode: 'boolean' }).notNull(),
  signatureError: text('signature_error'),
  body: text('body', { mode: 'json' }).$type<unknown>().notNull(),
});

export const request_log = sqliteTable('request_log', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id'),
  at: integer('at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  method: text('method').notNull(),
  url: text('url').notNull(),
  status: integer('status').notNull(),
  durationMs: integer('duration_ms').notNull(),
  errorCode: text('error_code'),
  requestHeaders: text('request_headers', { mode: 'json' }).$type<Record<string, string>>().notNull(),
  requestBody: text('request_body'),
  responseBody: text('response_body'),
  companyVkn: text('company_vkn'),
}, (t) => [
  index('request_log_tenant_id_idx').on(t.tenantId),
  index('request_log_at_idx').on(t.at),
]);

export const document_events = sqliteTable('document_events', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  documentId: text('document_id').notNull(),
  at: integer('at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  ruleId: text('rule_id').notNull(),
  axis: text('axis').notNull(),
  fromValue: text('from_value').notNull(),
  toValue: text('to_value').notNull(),
  rawGibCode: integer('raw_gib_code'),
  alarm: text('alarm'),
  documentVersion: integer('document_version').notNull(),
}, (t) => [
  index('document_events_document_id_idx').on(t.documentId),
  index('document_events_tenant_id_idx').on(t.tenantId),
]);
