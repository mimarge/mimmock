/**
 * Terim katmanı — panelin "açıklama TALEP ÜZERİNE" yarısı (PRODUCT.md).
 *
 * 🔴 KOPYA YOK: geçiş kurallarının açıklamaları ve MimForge atıfları burada
 * YENİDEN YAZILMAZ; `@shared/engine/transitions`ten okunur. Ölçüm iyileşince
 * sözlük de kendiliğinden düzelir.
 *
 * Buradaki el yazısı girdiler yalnız sunucuda yapılandırılmış hâli BULUNMAYAN
 * terimlerdir (kısaltmalar, kapı adları). Kaynağı gösterilemeyen bir cümle
 * "ölçüldü" diye yazılmaz — `source` alanı boşsa o satır bir tanımdır, ölçüm değil.
 */
import { TRANSITIONS } from '@shared/engine/transitions';
import { DOC_STATUS_NOTES, REPLY_STATUS_NOTES } from '@shared/status';

export interface Term {
  /** Tahtada geçen yazım. */
  term: string;
  /** Tek satırlık karşılık. */
  short: string;
  /** İsteyene ayrıntı. */
  long?: string;
  /** `mimforge:dosya:satır` — yalnız ÖLÇÜLMÜŞ satırlarda dolu. */
  source?: string;
}

/** Geçiş kurallarının açıklamaları — tek kaynaktan türetilir. */
export const RULES: ReadonlyMap<string, { note: string; source: string; to: string }> = new Map(
  TRANSITIONS.map((rule) => [
    rule.id,
    { note: rule.note ?? '', source: rule.source, to: rule.to },
  ]),
);

/** Ham GİB kodu → o kodu okuyan kural(lar). Kod tıklanınca gösterilir. */
export const CODE_RULES: ReadonlyMap<number, string[]> = (() => {
  const map = new Map<number, string[]>();
  for (const rule of TRANSITIONS) {
    if (typeof rule.rawGibCode !== 'number') continue;
    const list = map.get(rule.rawGibCode) ?? [];
    list.push(rule.id);
    map.set(rule.rawGibCode, list);
  }
  return map;
})();

const ENTRIES: readonly Term[] = [
  {
    term: 'ETTN',
    short: 'Evrensel Tekil Tanımlama Numarası — belgenin UUID kimliği.',
    long:
      'Belge numarasından farklıdır: numara seriden alınır ve insan okur, ETTN belgeyle ' +
      'birlikte doğar ve GİB tarafında tekilliği o sağlar. MimMock’ta ETTN, yön ile birlikte ' +
      'tekildir: aynı belge gönderenin GİDEN tahtasında ve alıcının GELEN kutusunda ' +
      'aynı ETTN ile durur.',
  },
  {
    term: 'S_APR',
    short: 'Gelen belgeye alıcının GİB’e verdiği sistem yanıtı zarfı.',
    long:
      'İKİ ADIMLIDIR: zarf gönderilir (belge RECEIVED kalır), sonra teyitlenir ve belge ' +
      'DELIVERED olur. Tek adımlı bir gelen kutusu bu ayrımı hiç öğretmez. Teyit kodu olarak ' +
      '1200 veya 1300 kabul edilir — GİDEN yolda 1200 yalnız ara eşiktir; GELEN yolda teyittir.',
    source: 'mimforge:system-response-activities.ts:57-59,122-136',
  },
  {
    term: 'DOCUMENT_NOT_SETTLED',
    short: 'Ticari yanıt kapısı: belge teslim olmadan yanıt verilemez.',
    long:
      'Gelen bir belgeye kabul/ret yazabilmek için önce S_APR teyidinin gelmiş, yani belgenin ' +
      'DELIVERED olmuş olması gerekir. Kapı kapalıyken panelde sebebi yazar.',
  },
  {
    term: 'POLL_DEADLINE',
    short: 'Sorgu süresi doldu — belge askıda kalır, hataya DÜŞMEZ.',
    long:
      'Belge düzleminde FAILED diye bir durum yoktur. Süre dolunca zarf AÇIK BIRAKILIR ve ' +
      'bir alarm üretilir. Bunu bir hata durumu sanan entegrasyon, gerçekte olmayan bir ' +
      'duruma dallanır. Zaman kumandasıyla 15 günü bir saniyede atlayıp görebilirsiniz.',
  },
  {
    term: 'CAS',
    short: 'Karşılaştır-ve-yaz kilidi: geç gelen kod teslimi ezemez.',
    long:
      'Her yazım “durum hâlâ okuduğum durumsa” koşuluyla yapılır. Koşul tutmazsa satır ' +
      'güncellenmez ve işlem sessizce hiçbir şey yapmaz — MimForge de böyle davranır.',
  },
  {
    term: 'ölü mektup',
    short: 'Webhook tüm denemeleri tüketti; artık kendiliğinden denenmez.',
    long: 'Elle yeniden gönderme ucu ölü mektuptan da çalışır.',
  },
  {
    term: 'TEST İMZASI',
    short: 'İmza yapısı gerçek, sertifika kendinden imzalı.',
    long:
      'Ayrıştırıcınız çalışır, imza doğrulaması yapı düzeyinde geçer; zincir doğrulaması ' +
      'KASTEN başarısız olur. Bu bir arıza değildir — gerçek mali mühür bir geliştirici ' +
      'makinesine konulmaz.',
  },
];

/**
 * İkaz bandının tam metinleri.
 *
 * Katlamanın üstünde iki paragraf açıklama duruyordu; bu, "yoğunluk varsayılan,
 * açıklama TALEP ÜZERİNE" cevabının ilk görünümde çiğnenmesiydi. Bant artık tek
 * satır; tam metin buradan, AÇIKLAMA katmanından gelir.
 */
const NOTICE_TERMS: readonly Term[] = [
  {
    term: 'YÜZEY GEÇİCİ',
    short: 'Bu yüzey geçicidir; üretim yüzeyi ayrı duyurulacak.',
    long:
      'Üretim yüzeyi farklı olabilir. Entegrasyonunuzla bu API arasına bir adaptör ' +
      'katmanı koymanız önerilir — MimMock, MimForge’un BUGÜNKÜ davranışının ' +
      'simülatörüdür, yarının geliştirici platformunun şartnamesi değildir.',
  },
  {
    term: 'ZİNCİR KASTEN GEÇERSİZ',
    short: 'İmza yapısı gerçek, sertifika kendinden imzalı.',
    long:
      'Ayrıştırıcınız çalışır ve imza yapı düzeyinde doğrulanır; zincir doğrulaması ' +
      'KASTEN başarısız olur. Bu bir arıza değildir — gerçek mali mühür bir ' +
      'geliştirici makinesine konulmaz.',
  },
];

/**
 * Durum adları — `@shared/status`'ten TÜRETİLİR (kopya yok). Aynı metin LLM
 * kılavuzunda da görünür; tek yerde düzelir.
 */
const STATUS_TERMS: readonly Term[] = [
  ...Object.entries(DOC_STATUS_NOTES),
  ...Object.entries(REPLY_STATUS_NOTES).filter(([k]) => !(k in DOC_STATUS_NOTES)),
].map(([term, note]) => ({
  term,
  short: note.short,
  ...(note.long || !note.producedByMock
    ? {
        long: [note.long, note.producedByMock ? null : 'Mock bu değeri bugün üretmiyor.']
          .filter(Boolean)
          .join(' '),
      }
    : {}),
}));

export const GLOSSARY: ReadonlyMap<string, Term> = new Map(
  [...ENTRIES, ...NOTICE_TERMS, ...STATUS_TERMS].map((t) => [t.term, t]),
);

/** Ham GİB kodlarının kısa okunuşu — kuralların `note` alanından türetilir. */
export function codeGloss(code: number): { rules: string[]; notes: string[] } {
  const rules = CODE_RULES.get(code) ?? [];
  return { rules, notes: rules.map((id) => RULES.get(id)?.note ?? '').filter(Boolean) };
}

/**
 * Kural notlarındaki vurgu işaretini ayıklar.
 *
 * 🔴 Veri katmanı kendi dilinde kalır (`transitions.ts` notlarında `🔑` bir
 * vurgudur), ama TAHTAYA emoji basılmaz: yazı tipine göre başka görünen bir
 * glif, bilgi taşıyan bir yüzeyde kabul edilemez. Vurguyu çizilmiş işaret verir.
 */
export function stripEmphasis(note: string): { text: string; emphasised: boolean } {
  const trimmed = note.replace(/^[\p{Extended_Pictographic}\u{FE0F}]+\s*/u, '');
  return { text: trimmed, emphasised: trimmed !== note };
}
