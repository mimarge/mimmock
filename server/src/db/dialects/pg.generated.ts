// ÜRETİLMİŞ DOSYA — elle düzenlemeyin.
// Kaynak: src/db/spec.ts · Üretici: src/db/codegen.ts
// Güncellemek için: pnpm db:codegen

import { pgTable, text, integer, boolean, timestamp, jsonb, uniqueIndex, index } from 'drizzle-orm/pg-core';

export const tenants = pgTable('tenants', {
  id: text('id').primaryKey(),
  apiKey: text('api_key').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().$defaultFn(() => new Date()),
});

export const companies = pgTable('companies', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  vkn: text('vkn').notNull(),
  title: text('title').notNull(),
  addressStreet: text('address_street'),
  addressDistrict: text('address_district'),
  addressCity: text('address_city'),
  addressCountry: text('address_country').notNull(),
  taxOffice: text('tax_office'),
  pkAliases: jsonb('pk_aliases').$type<string[]>().notNull(),
  gbAliases: jsonb('gb_aliases').$type<string[]>().notNull(),
  profiles: jsonb('profiles').$type<string[]>().notNull(),
  templateId: text('template_id'),
  seriesPrefix: text('series_prefix'),
  eInvoiceRegistered: boolean('e_invoice_registered').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  uniqueIndex('companies_tenant_id_vkn_uq').on(t.tenantId, t.vkn),
  index('companies_tenant_id_idx').on(t.tenantId),
]);

export const documents = pgTable('documents', {
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
  sourceJson: jsonb('source_json').$type<unknown>(),
  sourceKind: text('source_kind').notNull(),
  appliedXsd: text('applied_xsd'),
  appliedSchematron: text('applied_schematron'),
  numberReservationId: text('number_reservation_id'),
  signatureKind: text('signature_kind'),
  signedAt: timestamp('signed_at', { withTimezone: true, mode: 'date' }),
  srSentAt: timestamp('sr_sent_at', { withTimezone: true, mode: 'date' }),
  srConfirmedAt: timestamp('sr_confirmed_at', { withTimezone: true, mode: 'date' }),
  srCode: integer('sr_code'),
  replyDecision: text('reply_decision'),
  replyReason: text('reply_reason'),
  replyAt: timestamp('reply_at', { withTimezone: true, mode: 'date' }),
  replyDeadlineAt: timestamp('reply_deadline_at', { withTimezone: true, mode: 'date' }),
  sourceDocumentId: text('source_document_id'),
  generated: boolean('generated').notNull(),
  generatedScenario: text('generated_scenario'),
  scenario: text('scenario'),
  nextState: text('next_state'),
  nextAt: timestamp('next_at', { withTimezone: true, mode: 'date' }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true, mode: 'date' }),
  version: integer('version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  uniqueIndex('documents_tenant_id_direction_ettn_uq').on(t.tenantId, t.direction, t.ettn),
  index('documents_company_id_idx').on(t.companyId),
  index('documents_tenant_id_direction_idx').on(t.tenantId, t.direction),
  index('documents_status_idx').on(t.status),
]);

export const webhooks = pgTable('webhooks', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  companyId: text('company_id'),
  url: text('url').notNull(),
  secret: text('secret').notNull(),
  events: jsonb('events').$type<string[]>().notNull(),
  active: boolean('active').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  index('webhooks_tenant_id_idx').on(t.tenantId),
]);

export const webhook_deliveries = pgTable('webhook_deliveries', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  webhookId: text('webhook_id').notNull().references(() => webhooks.id, { onDelete: 'cascade' }),
  sequence: integer('sequence').notNull(),
  eventType: text('event_type').notNull(),
  documentId: text('document_id'),
  documentVersion: integer('document_version'),
  payload: jsonb('payload').$type<unknown>().notNull(),
  status: text('status').notNull(),
  attempt: integer('attempt').notNull(),
  httpStatus: integer('http_status'),
  error: text('error'),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  index('webhook_deliveries_tenant_id_idx').on(t.tenantId),
  index('webhook_deliveries_webhook_id_idx').on(t.webhookId),
  index('webhook_deliveries_status_idx').on(t.status),
]);

export const webhook_sink_events = pgTable('webhook_sink_events', {
  id: text('id').primaryKey(),
  receivedAt: timestamp('received_at', { withTimezone: true, mode: 'date' }).notNull().$defaultFn(() => new Date()),
  eventType: text('event_type').notNull(),
  sequence: integer('sequence'),
  signatureValid: boolean('signature_valid').notNull(),
  signatureError: text('signature_error'),
  body: jsonb('body').$type<unknown>().notNull(),
});

export const request_log = pgTable('request_log', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id'),
  at: timestamp('at', { withTimezone: true, mode: 'date' }).notNull().$defaultFn(() => new Date()),
  method: text('method').notNull(),
  url: text('url').notNull(),
  status: integer('status').notNull(),
  durationMs: integer('duration_ms').notNull(),
  errorCode: text('error_code'),
  requestHeaders: jsonb('request_headers').$type<Record<string, string>>().notNull(),
  requestBody: text('request_body'),
  responseBody: text('response_body'),
  companyVkn: text('company_vkn'),
}, (t) => [
  index('request_log_tenant_id_idx').on(t.tenantId),
  index('request_log_at_idx').on(t.at),
]);

export const document_events = pgTable('document_events', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  documentId: text('document_id').notNull(),
  at: timestamp('at', { withTimezone: true, mode: 'date' }).notNull().$defaultFn(() => new Date()),
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
