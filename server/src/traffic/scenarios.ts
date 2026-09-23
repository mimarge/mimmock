/**
 * Trafik senaryo kataloğu — plan §5b:
 * *"düz · iskontolu · dövizli · tevkifatlı · iade · ticari"*
 *
 * Her senaryo bir `SimpleInvoiceInput` üretir; belge json2ubl-ts ile UBL'e
 * çevrilir ve **GERÇEK şematrondan geçirilir**. Alan adları ölçüldü:
 * `json2ubl-ts/examples-matrix/valid/**` ve `src/calculator/simple-types.ts`.
 *
 * 🔴 Plan §5b'nin tek kırmızı kuralı: *"Üretilen trafik GERÇEK UBL — şematrondan
 * geçer. Sahte gövde geliştiriciye hiçbir şey öğretmez; özelliğin tüm değeri
 * buna bağlıdır."* Bu yüzden katalogdaki hiçbir senaryo "yaklaşık" değildir.
 */
import type { Rng } from './random.js';
import type { ExternalSender } from './senders.js';

export interface TrafficParty {
  taxNumber: string;
  name: string;
  taxOffice: string;
  address: string;
  district: string;
  city: string;
}

export interface TrafficScenario {
  name: string;
  description: string;
  /** Üretilen belgenin ProfileID'si — gelen kutusunda yanıt bekleyip beklemeyeceğini belirler. */
  profile: 'TEMELFATURA' | 'TICARIFATURA';
  build(rng: Rng, sender: ExternalSender, receiver: TrafficParty, now: Date): Record<string, unknown>;
}

const ITEMS = [
  { name: 'Ambalaj malzemesi', unitCode: 'Adet' },
  { name: 'Kablo kanalı', unitCode: 'Adet' },
  { name: 'Danışmanlık hizmeti', unitCode: 'Adet' },
  { name: 'Bakım onarım hizmeti', unitCode: 'Adet' },
  { name: 'Kırtasiye malzemesi', unitCode: 'Adet' },
  { name: 'Sarf malzemesi', unitCode: 'Kilogram' },
] as const;

/**
 * Ortak gövde — her senaryo bunu daraltır.
 *
 * ⚠️ Tarih GEÇMİŞTEN seçilir. İlk kurulumda ay/gün rastgele çekiliyordu ve
 * zaman zaman GELECEK bir tarih üretiyordu; json2ubl-ts bunu `Geçersiz değer:
 * issueDate` ile reddediyordu. Fatura tarihi gelecekte olamaz — kütüphane haklı,
 * üreteç yanlıştı. Canlı ölçümde yakalandı.
 */
function base(
  rng: Rng,
  sender: ExternalSender,
  receiver: TrafficParty,
  profile: string,
  type: string,
  now: Date,
): Record<string, unknown> {
  const issued = new Date(now.getTime() - rng.int(0, 45) * 24 * 60 * 60 * 1000);
  const stamp =
    `${issued.getFullYear()}-${String(issued.getMonth() + 1).padStart(2, '0')}-` +
    `${String(issued.getDate()).padStart(2, '0')}`;
  return {
    // Belge no biçimi MimForge'un `DOCNO_FORMAT_RE`'si ile uyumlu: 3 önek + yıl + 9 hane.
    // Belge no biçimi `DOCNO_FORMAT_RE` ile uyumlu; seri yılı belge tarihiyle
    // AYNI olmalı (MimForge `DOCNO_YEAR_MISMATCH` kapısı).
    id: `TRF${issued.getFullYear()}${String(rng.int(1, 999_999_999)).padStart(9, '0')}`,
    uuid: rng.uuid(),
    datetime: `${stamp}T${String(rng.int(8, 18)).padStart(2, '0')}:00:00`,
    profile,
    type,
    currencyCode: 'TRY',
    sender: {
      taxNumber: sender.taxNumber,
      name: sender.name,
      taxOffice: sender.taxOffice,
      address: sender.address,
      district: sender.district,
      city: sender.city,
    },
    customer: {
      taxNumber: receiver.taxNumber,
      name: receiver.name,
      taxOffice: receiver.taxOffice,
      address: receiver.address,
      district: receiver.district,
      city: receiver.city,
    },
  };
}

function lines(rng: Rng, count: number, extra?: Record<string, unknown>) {
  return Array.from({ length: count }, () => {
    const item = rng.pick(ITEMS);
    return {
      name: item.name,
      quantity: rng.int(1, 25),
      price: rng.money(50, 4000),
      unitCode: item.unitCode,
      kdvPercent: rng.pick([1, 10, 20]),
      ...extra,
    };
  });
}

export const TRAFFIC_SCENARIOS: readonly TrafficScenario[] = [
  {
    name: 'duz',
    description: 'Düz yurt içi satış — temel fatura.',
    profile: 'TEMELFATURA',
    build: (rng, sender, receiver, now) => ({
      ...base(rng, sender, receiver, 'TEMELFATURA', 'SATIS', now),
      lines: lines(rng, rng.int(1, 4)),
    }),
  },
  {
    name: 'iskontolu',
    description: 'Satır düzeyinde iskontolu satış (`allowancePercent`).',
    profile: 'TEMELFATURA',
    build: (rng, sender, receiver, now) => ({
      ...base(rng, sender, receiver, 'TEMELFATURA', 'SATIS', now),
      lines: lines(rng, rng.int(1, 3), { allowancePercent: rng.pick([5, 10, 15, 20]) }),
    }),
  },
  {
    name: 'dovizli',
    description: 'Döviz cinsinden satış — `currencyCode` + `exchangeRate`.',
    profile: 'TEMELFATURA',
    build: (rng, sender, receiver, now) => ({
      ...base(rng, sender, receiver, 'TEMELFATURA', 'SATIS', now),
      currencyCode: rng.pick(['USD', 'EUR']),
      exchangeRate: rng.money(28, 45),
      lines: lines(rng, rng.int(1, 3)),
    }),
  },
  {
    name: 'tevkifatli',
    description: 'KDV tevkifatlı satış — satırda `withholdingTaxCode`.',
    profile: 'TEMELFATURA',
    build: (rng, sender, receiver, now) => ({
      ...base(rng, sender, receiver, 'TEMELFATURA', 'TEVKIFAT', now),
      // Kod kümesi ölçüldü: examples-matrix tevkifat senaryoları.
      lines: lines(rng, rng.int(1, 2), {
        kdvPercent: 20,
        withholdingTaxCode: rng.pick(['601', '603', '605']),
      }),
    }),
  },
  {
    name: 'ticari',
    description: '🔑 Ticari fatura — gelen kutusunda YANIT BEKLER (AWAITING).',
    profile: 'TICARIFATURA',
    build: (rng, sender, receiver, now) => ({
      ...base(rng, sender, receiver, 'TICARIFATURA', 'SATIS', now),
      lines: lines(rng, rng.int(1, 4)),
    }),
  },
];

/**
 * ⚠️ `iade` senaryosu katalogda YOK. Plan §5b onu sayıyor ama iade faturası
 * `billingReference` ile ÖNCEKİ bir faturaya atıf yapmak zorundadır; üretecin
 * elinde o fatura yoktur ve uydurulmuş bir referans "gerçek UBL" kuralını
 * çiğnerdi. Üreteç kendi ürettiği bir faturayı referans alabilecek duruma
 * geldiğinde eklenecek — `docs/m8-olcum.md` §6'da yazılı.
 */
export const MISSING_SCENARIOS = ['iade'] as const;
