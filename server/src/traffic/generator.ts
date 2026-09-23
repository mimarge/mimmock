/**
 * TRAFİK ÜRETECİ — plan K16 ve §5b.
 *
 * Motorun ikinci kipi: *"kendi kendine belge üretip içerideki şirketlere gönderir."*
 *
 * 🔴 Plan §5b'nin kırmızı kuralı:
 *   *"Üretilen trafik GERÇEK UBL — şematrondan geçer. Sahte gövde geliştiriciye
 *    hiçbir şey öğretmez. Özelliğin tüm değeri buna bağlı."*
 *
 * Bu yüzden üreteç json2ubl-ts ile UBL üretir ve CANLI doğrulayıcıya sorar.
 * Doğrulamadan geçmeyen belge **gelen kutusuna KONULMAZ** ve sayaca hata olarak
 * yazılır — sessizce atılmaz.
 *
 * 🔑 Bedava fayda (plan §5b): *"üreteç mock'un sürekli kendi kendini sınamasıdır.
 * Üretebiliyor ve ingest kabul ediyorsa halka kanıtlanıyor demektir; üreteç
 * bozulursa bir şeyin kaydığının erken uyarısıdır."*
 */
import { eq } from 'drizzle-orm';
import { SimpleInvoiceBuilder } from 'json2ubl-ts';
import { createRng, seedFrom, type Rng } from './random.js';
import { EXTERNAL_SENDERS, type ExternalSender } from './senders.js';
import { TRAFFIC_SCENARIOS, type TrafficScenario } from './scenarios.js';
import { createInboundDocument } from '../inbound.js';
import { MimMockError } from '../errors.js';
import { SCHEMATRON_TYPE_BY_DOC_TYPE } from '../status.js';
import type { Validator } from '../kittest/validate.js';
import type { CompanyRow, DocumentRow, Repo } from '../db/repo.js';
import type { Engine } from '../engine/engine.js';
import type { Clock } from '../engine/clock.js';
import type { DbHandle } from '../db/client.js';

export interface GeneratorDeps {
  handle: DbHandle;
  repo: Repo;
  engine: Engine;
  clock: Clock;
  validator: Validator;
  /** Belge gelen kutusuna düştüğünde — webhook buraya takılır. */
  onGenerated?: (document: DocumentRow, scenario: string) => void | Promise<void>;
}

export interface GeneratorConfig {
  /** Tohum: aynı tohum aynı trafiği verir (plan §5b). */
  seed: string;
  /** Her turda kaç belge üretilsin. */
  burst: number;
  /**
   * Senaryo kataloğu. Varsayılan `TRAFFIC_SCENARIOS`.
   * Enjekte edilebilir olması bir test kolaylığı DEĞİL, bir ÖLÇÜM koşuludur:
   * canlı şematron kapısının gerçekten kapı olduğunu göstermenin tek yolu,
   * ona bilerek geçersiz bir belge vermektir.
   */
  scenarios?: readonly TrafficScenario[];
}

export interface GenerationResult {
  documentId: string | null;
  scenario: string;
  sender: string;
  receiver: string;
  /** Canlı doğrulayıcıdan geçti mi — geçmezse belge YAZILMAZ. */
  valid: boolean;
  /**
   * Belge geçerliydi ama AYNI ETTN zaten gelen kutusunda.
   *
   * 🔑 Determinizmin doğal sonucu: aynı tohum aynı ETTN'leri üretir, aynı
   * veritabanına iki kez yazılamaz. Bu bir HATA DEĞİLDİR ve sessizce
   * yutulmaz — ayrı bir alan olarak raporlanır ki "üreteç durdu mu" sorusu
   * "hayır, aynı akışı tekrar üretti" diye cevaplanabilsin.
   */
  duplicate: boolean;
  errors: string[];
}

export interface TrafficGenerator {
  /** Bir tur üretir. Alıcı yoksa boş döner. */
  run(tenantId: string): Promise<GenerationResult[]>;
  /** Tohumu değiştirmeden İÇERİK üretir — yazmaz. Determinizm testi için. */
  preview(tenantId: string): Promise<Array<{ scenario: string; sender: string; ettn: string }>>;
  /** Tohumu sıfırlar — aynı akışı baştan üretmek için. */
  reset(): void;
  /** Şu ana kadarki sayaçlar. */
  stats(): { produced: number; rejected: number };
}

export function createTrafficGenerator(
  deps: GeneratorDeps,
  config: GeneratorConfig,
): TrafficGenerator {
  let rng: Rng = createRng(seedFrom(config.seed));
  let produced = 0;
  let rejected = 0;
  const catalogue = config.scenarios ?? TRAFFIC_SCENARIOS;

  /** Alıcı, mock'ta TANIMLI bir şirkettir; gönderici ASLA değildir. */
  function receiverFrom(company: CompanyRow) {
    return {
      taxNumber: company.vkn,
      name: company.title,
      taxOffice: company.taxOffice ?? 'DENEME VERGİ DAİRESİ',
      address: company.addressStreet ?? 'Deneme Mahallesi 1. Sokak No:1',
      district: company.addressDistrict ?? 'Çankaya',
      city: company.addressCity ?? 'Ankara',
    };
  }

  async function produceOne(
    tenantId: string,
    company: CompanyRow,
    scenario: TrafficScenario,
    sender: ExternalSender,
  ): Promise<GenerationResult> {
    const result: GenerationResult = {
      documentId: null,
      scenario: scenario.name,
      sender: sender.taxNumber,
      receiver: company.vkn,
      valid: false,
      duplicate: false,
      errors: [],
    };

    // 1) JSON → UBL (json2ubl-ts). Kütüphane reddederse senaryo bozuktur.
    let xml: string;
    try {
      xml = new SimpleInvoiceBuilder().build(
        scenario.build(rng, sender, receiverFrom(company), deps.clock.now()) as never,
      ).xml;
    } catch (error) {
      rejected += 1;
      result.errors.push(
        `json2ubl-ts reddetti: ${error instanceof Error ? error.message : String(error)}`,
      );
      return result;
    }

    // 2) 🔴 CANLI şematron. Geçmezse belge YAZILMAZ.
    try {
      const verdict = await deps.validator.validate(xml, {
        type: SCHEMATRON_TYPE_BY_DOC_TYPE.EFATURA,
        profile: 'unsigned-invoice',
      });
      if (!verdict.validSchema || !verdict.validSchematron) {
        rejected += 1;
        result.errors = [
          ...verdict.schemaErrors.slice(0, 3),
          ...verdict.errors.slice(0, 3).map((e) => `${e.ruleId}: ${e.message}`),
        ];
        return result;
      }
    } catch (error) {
      rejected += 1;
      result.errors.push(
        `doğrulayıcı erişilemedi: ${error instanceof Error ? error.message : String(error)}`,
      );
      return result;
    }
    result.valid = true;

    // 3) Gelen kutusuna koy — normal gelen belge yolundan, iki adımlı akışla.
    let document;
    try {
      document = await createInboundDocument(
        { xml, receiver: company, tenantId },
        { repo: deps.repo, engine: deps.engine, clock: deps.clock },
      );
    } catch (error) {
      // Aynı tohum aynı ETTN'i üretir; ikinci yazma reddedilir (bkz. `duplicate`).
      if (error instanceof MimMockError && error.errorCode === 'DUPLICATE_UUID') {
        result.duplicate = true;
        return result;
      }
      throw error;
    }

    // 4) 🔑 İŞARETLE. Geliştirici kendi trafiğiyle karıştırmasın (plan §5b).
    await deps.handle.db
      .update(deps.handle.tables.documents)
      .set({ generated: true, generatedScenario: scenario.name })
      .where(eq(deps.handle.tables.documents.id, document.id));

    produced += 1;
    result.documentId = document.id;
    await deps.onGenerated?.(document, scenario.name);
    return result;
  }

  return {
    async run(tenantId) {
      const companies = await deps.repo.listCompanies(tenantId);
      // Yalnız e-Fatura mükellefleri gelen belge alabilir.
      const targets = companies.filter((c) => c.eInvoiceRegistered);
      if (targets.length === 0) return [];

      const results: GenerationResult[] = [];
      for (let i = 0; i < config.burst; i++) {
        const company = rng.pick(targets);
        const scenario = rng.pick(catalogue);
        const sender = rng.pick(EXTERNAL_SENDERS);
        results.push(await produceOne(tenantId, company, scenario, sender));
      }
      return results;
    },

    async preview(tenantId) {
      const companies = (await deps.repo.listCompanies(tenantId)).filter(
        (c) => c.eInvoiceRegistered,
      );
      if (companies.length === 0) return [];
      const out: Array<{ scenario: string; sender: string; ettn: string }> = [];
      for (let i = 0; i < config.burst; i++) {
        const company = rng.pick(companies);
        const scenario = rng.pick(catalogue);
        const sender = rng.pick(EXTERNAL_SENDERS);
        const input = scenario.build(rng, sender, receiverFrom(company), deps.clock.now());
        out.push({
          scenario: scenario.name,
          sender: sender.taxNumber,
          ettn: String(input.uuid),
        });
      }
      return out;
    },

    reset() {
      rng = createRng(seedFrom(config.seed));
      produced = 0;
      rejected = 0;
    },

    stats: () => ({ produced, rejected }),
  };
}
