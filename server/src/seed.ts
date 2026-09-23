/**
 * Tohum veri — plan K13: `docker run` der demez boş panel görülmesin.
 *
 * 🔴 Public depo kapısı (plan §2b/4): buradaki her kimlik SENTETİKtir.
 * VKN'ler `1111111111`/`2222222222`, unvanlar `DENEME …` — bunlar MimForge'un
 * `tpl-forge/samples` korpusunda "kanıtlanabilir sentetik" diye ÖLÇÜLMÜŞ
 * değerlerin aynısıdır (plan §2b tablosu). Gerçek mükellef verisi girmez.
 */
import type { Repo } from './db/repo.js';

/** Tohum API anahtarı — sabit ve bilinir; yerel sandbox içindir, gizli değildir. */
export const SEED_TENANT_API_KEY = 'mimmock_dev_key';
export const SEED_TENANT_ID = 'tn_seed';

export interface SeedResult {
  created: boolean;
  tenantApiKey: string;
  companyVkns: string[];
  webhookUrl?: string;
}

export interface SeedOptions {
  /** Mock'un kendi adresi — tohum webhook buraya bakar. */
  selfUrl?: string;
}

export async function seedIfEmpty(repo: Repo, options?: SeedOptions): Promise<SeedResult> {
  const existing = await repo.listTenants();
  if (existing.length > 0) {
    const first = existing[0]!;
    const companies = await repo.listCompanies(first.id);
    return { created: false, tenantApiKey: first.apiKey, companyVkns: companies.map((c) => c.vkn) };
  }

  const tenant = await repo.insertTenant({
    id: SEED_TENANT_ID,
    apiKey: SEED_TENANT_API_KEY,
    name: 'DENEME MUHASEBE YAZILIM A.Ş.',
  });

  await repo.insertCompany({
    id: 'co_seed_1',
    tenantId: tenant.id,
    vkn: '1111111111',
    title: 'DENEME GÖNDERİCİ A.Ş.',
    addressStreet: 'Deneme Mahallesi 1. Sokak No:1',
    addressDistrict: 'Çankaya',
    addressCity: 'Ankara',
    addressCountry: 'Türkiye',
    taxOffice: 'Deneme Vergi Dairesi',
    pkAliases: ['urn:mail:defaultpk@deneme1.com'],
    gbAliases: ['urn:mail:defaultgb@deneme1.com'],
    profiles: ['TEMELFATURA', 'TICARIFATURA', 'EARSIVFATURA'],
    templateId: null,
    seriesPrefix: 'DNM',
    eInvoiceRegistered: true,
  });

  await repo.insertCompany({
    id: 'co_seed_2',
    tenantId: tenant.id,
    vkn: '2222222222',
    title: 'DENEME ALICI LTD. ŞTİ.',
    addressStreet: 'Deneme Mahallesi 2. Sokak No:2',
    addressDistrict: 'Kadıköy',
    addressCity: 'İstanbul',
    addressCountry: 'Türkiye',
    taxOffice: 'Deneme Vergi Dairesi',
    pkAliases: ['urn:mail:defaultpk@deneme2.com'],
    gbAliases: ['urn:mail:defaultgb@deneme2.com'],
    profiles: ['TEMELFATURA', 'TICARIFATURA'],
    templateId: null,
    seriesPrefix: 'ALC',
    eInvoiceRegistered: true,
  });

  /*
   * 🔑 K13: "çalışan webhook alıcısı". Tohum webhook mock'un KENDİ sink ucuna
   * bakar; böylece `docker run` der demez teslim günlüğünde gerçek kayıtlar,
   * gerçek imzalar ve gerçek yeniden denemeler görünür. Boş bir günlük
   * geliştiriciye hiçbir şey öğretmez.
   */
  await insertSeedWebhook(repo, tenant.id, options?.selfUrl ?? 'http://127.0.0.1:8088');

  return {
    created: true,
    tenantApiKey: tenant.apiKey,
    companyVkns: ['1111111111', '2222222222'],
    webhookUrl: `${options?.selfUrl ?? 'http://127.0.0.1:8088'}/v1/_sandbox/webhook-sink`,
  };
}

/** Tohum webhook — mock'un kendi sink'ine. Anahtar sabit ve bilinir. */
async function insertSeedWebhook(repo: Repo, tenantId: string, selfUrl: string): Promise<void> {
  await repo.insertWebhook({
    id: 'wh_seed',
    tenantId,
    companyId: null,
    url: `${selfUrl.replace(/\/+$/, '')}/v1/_sandbox/webhook-sink`,
    secret: SEED_WEBHOOK_SECRET,
    events: [],
    active: true,
  });
}

/** Tohum alıcının anahtarı — `routes/webhooks.ts`'teki SINK_SECRET ile AYNI olmalı. */
export const SEED_WEBHOOK_SECRET = 'whsec_mimmock_sink';
