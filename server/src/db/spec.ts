/**
 * Şemanın TEK KAYNAĞI — burası VERİ, kod değil.
 *
 * Neden böyle: Drizzle'da `sqliteTable` ile `pgTable` AYRI API'lerdir. Tabloları
 * iki lehçe için elle yazmak, planın Prisma'yı elediği gerekçeyi (iki şema =
 * kopya, plan §2c/K18) Drizzle'da geri getirirdi. Bu yüzden tablolar burada bir
 * kez tarif edilir; `codegen.ts` iki lehçenin Drizzle dosyasını BU tariften
 * üretir. Üretilen dosyalar elle düzenlenmez.
 *
 * Kolon adları burada camelCase'tir; DB'deki karşılığı snake_case'e çevrilir.
 */

/** Mantıksal kolon cinsi. Lehçe karşılıkları `codegen.ts`'in eşleme tablosunda. */
export type ColumnKind = 'text' | 'int' | 'bool' | 'ts' | 'json';

export interface ColumnSpec {
  kind: ColumnKind;
  primaryKey?: true;
  notNull?: true;
  /** Tekil kolon kısıtı. Birleşik tekillik için `TableSpec.uniques`. */
  unique?: true;
  references?: { table: string; column: string; onDelete?: 'cascade' };
  /** `now` = satır yazılırken uygulama tarafında damgalanır (iki lehçede aynı). */
  default?: 'now';
  /**
   * Yalnız `kind: 'json'` için: sütunun TS tip METNİ (örn. `'string[]'`).
   * codegen bunu `$type<...>()` olarak yazar; satır tipleri oradan türer.
   */
  jsonType?: string;
}

export interface TableSpec {
  columns: Record<string, ColumnSpec>;
  /** Birleşik tekillik: her eleman camelCase kolon adlarından oluşur. */
  uniques?: string[][];
  /** Birleşik/tekil indeksler. */
  indexes?: string[][];
}

/**
 * MimMock şeması — M1 dilimi.
 *
 * Kaynak modeli plan §3'ten: tenant → company. Belge/webhook/rapor tabloları
 * kendi fazlarında (M2/M4/M6) buraya eklenir; tablo eklemek tek dosyalık iştir.
 */
export const schemaSpec = {
  /** API anahtarının sahibi — muhasebe yazılımı (plan K5). */
  tenants: {
    columns: {
      id: { kind: 'text', primaryKey: true },
      /** `Authorization: Bearer <apiKey>` — kiracıyı bu belirler (K5). */
      apiKey: { kind: 'text', notNull: true, unique: true },
      name: { kind: 'text', notNull: true },
      createdAt: { kind: 'ts', notNull: true, default: 'now' },
    },
  },

  /** Mükellef — MimForge'un `branch` karşılığı (plan §3). */
  companies: {
    columns: {
      id: { kind: 'text', primaryKey: true },
      tenantId: {
        kind: 'text',
        notNull: true,
        references: { table: 'tenants', column: 'id', onDelete: 'cascade' },
      },
      /** VKN (10 hane) veya TCKN (11 hane). `X-Company` bu değeri taşır. */
      vkn: { kind: 'text', notNull: true },
      title: { kind: 'text', notNull: true },

      /* Adres — UBL `PartyAddress` için M2'de gerekecek asgari küme. */
      addressStreet: { kind: 'text' },
      addressDistrict: { kind: 'text' },
      addressCity: { kind: 'text' },
      addressCountry: { kind: 'text', notNull: true },
      taxOffice: { kind: 'text' },

      /*
       * ETİKETLER — plan §3: "tanımlıysa mükellef" YETMEZ.
       * PK = posta kutusu etiketi (alıcı tarafı), GB = gönderici birim etiketi.
       * MimForge'da bunlar `gib-user-list`ten gelir; mock'ta şirket tanımının
       * parçasıdır, yoksa geliştirici etiket seçimini hiç öğrenmez.
       */
      pkAliases: { kind: 'json', notNull: true, jsonType: 'string[]' },
      gbAliases: { kind: 'json', notNull: true, jsonType: 'string[]' },

      /** Gönderilebilecek `ProfileID` kümesi. Değerler `profiles.ts`'te. */
      profiles: { kind: 'json', notNull: true, jsonType: 'string[]' },

      /** mimkit-test şablon seçimi (M7'de kullanılacak). */
      templateId: { kind: 'text' },
      /** mimkit numaratör serisi öneki (M2'de kullanılacak). */
      seriesPrefix: { kind: 'text' },

      /** e-Fatura mükellefi mi (sicilde kayıtlı mı) — M2'nin e-Arşiv ayrımı için. */
      eInvoiceRegistered: { kind: 'bool', notNull: true },

      createdAt: { kind: 'ts', notNull: true, default: 'now' },
      updatedAt: { kind: 'ts', notNull: true, default: 'now' },
    },
    uniques: [['tenantId', 'vkn']],
    indexes: [['tenantId']],
  },

  /**
   * Belge — GİDEN ve GELEN (plan §3).
   *
   * 🔴 `status` MimForge'dan ÖLÇÜLMÜŞ sözlüktür (`src/status.ts`), uydurma değil.
   * Ölü değerler (`SENT`, belge düzleminde `FAILED`, `SENT_TO_RECEIVER`) burada da
   * ÜRETİLMEZ — sözlük §6-B.
   */
  documents: {
    columns: {
      id: { kind: 'text', primaryKey: true },
      tenantId: {
        kind: 'text',
        notNull: true,
        references: { table: 'tenants', column: 'id', onDelete: 'cascade' },
      },
      companyId: {
        kind: 'text',
        notNull: true,
        references: { table: 'companies', column: 'id', onDelete: 'cascade' },
      },

      /** ETTN — UBL `cbc:UUID`. Kiracı içinde tekil (ingest `DUPLICATE_UUID` kapısı). */
      ettn: { kind: 'text', notNull: true },
      /** `OUTBOUND` | `INBOUND` (sözlük §1.6). */
      direction: { kind: 'text', notNull: true },
      /** `EFATURA` | `EARSIV` | `EIRSALIYE` | `ESMM` | `EMM` (sözlük §1.6). */
      type: { kind: 'text', notNull: true },
      /** UBL `cbc:ProfileID`. */
      profile: { kind: 'text' },
      /** UBL `cbc:InvoiceTypeCode`. */
      typeCode: { kind: 'text' },

      /** Bizim sözlüğümüz — birincil (sözlük §1.1). */
      status: { kind: 'text', notNull: true },
      /** Ham GİB kodu — yanında gösterilir (plan §5 sunum kuralı). */
      rawGibCode: { kind: 'int' },
      /** Yanıt durumu (sözlük §1.2). */
      replyStatus: { kind: 'text', notNull: true },

      documentNumber: { kind: 'text' },
      /** Belge düzenlenme tarihi, `YYYY-MM-DD`. */
      issueDate: { kind: 'text', notNull: true },

      senderVkn: { kind: 'text' },
      receiverVkn: { kind: 'text' },
      currencyCode: { kind: 'text' },
      payableAmount: { kind: 'text' },

      /** Üretilen/alınan UBL. */
      ublXml: { kind: 'text', notNull: true },
      /** JSON yolundan geldiyse özgün gövde (panelin "ne gönderdi" sorusu için). */
      sourceJson: { kind: 'json', jsonType: 'unknown' },
      /** `json` | `ubl` — hangi uçtan girdi. */
      sourceKind: { kind: 'text', notNull: true },

      /** Doğrulama damgası (mimkit yanıtından). */
      appliedXsd: { kind: 'text' },
      appliedSchematron: { kind: 'text' },

      /** Numara mimkit'ten alındıysa rezervasyon kimliği. */
      numberReservationId: { kind: 'text' },

      /**
       * İmza durumu: `null` (imzasız) veya `test-certificate`.
       * 🔴 `real-seal` diye bir değer YOKTUR ve olmayacaktır (plan K9).
       */
      signatureKind: { kind: 'text' },
      signedAt: { kind: 'ts' },

      /*
       * GELEN belge — sistem yanıtı (S_APR) takibi (sözlük §1.3, §3.2).
       * 🔑 İki adımlı akışın ikinci adımı buradan okunur: belge `DELIVERED`'a
       * ancak verdiğimiz S_APR GİB'de TEYİTLENİNCE geçer.
       */
      srSentAt: { kind: 'ts' },
      srConfirmedAt: { kind: 'ts' },
      srCode: { kind: 'int' },

      /** Ticari yanıt (sözlük §3.3). */
      /** Yanıt açılırken saklanan karar: `ACCEPTED` | `REJECTED` | `PARTIAL`. */
      replyDecision: { kind: 'text' },
      replyReason: { kind: 'text' },
      replyAt: { kind: 'ts' },
      /** Yanıt penceresinin çıpası — GELEN: alım anı, GİDEN: teslim anı. */
      replyDeadlineAt: { kind: 'ts' },

      /** Bu belge hangi giden belgeden doğdu (şirketler-arası teslim, K7a). */
      sourceDocumentId: { kind: 'text' },

      /**
       * 🔑 Trafik üretecinin ürettiği belge mi (plan §5b).
       * *"Panelde ve istek günlüğünde İŞARETLİ — geliştirici kendi trafiğiyle
       * karıştırmasın."* İşaretsiz üretilmiş trafik, sandbox'ı güvenilmez kılar.
       */
      generated: { kind: 'bool', notNull: true },
      /** Hangi trafik senaryosu üretti (`duz`, `ticari`, …). */
      generatedScenario: { kind: 'text' },

      /** Motor (M3) alanları — şimdilik boş; tablo M3'te değişmesin diye burada. */
      scenario: { kind: 'text' },
      nextState: { kind: 'text' },
      nextAt: { kind: 'ts' },
      deliveredAt: { kind: 'ts' },

      /**
       * Belge sürümü — her durum geçişinde artar.
       * Plan §7: *"sıralama GARANTİ EDİLMEZ → her olayda sequence + documentVersion"*.
       * Tüketici sırayı varsayamaz; hangi olayın daha yeni olduğunu bu sayıdan anlar.
       */
      version: { kind: 'int', notNull: true },

      createdAt: { kind: 'ts', notNull: true, default: 'now' },
      updatedAt: { kind: 'ts', notNull: true, default: 'now' },
    },
    /*
     * 🔑 Tekillik YÖN bazındadır. Aynı ETTN bir kiracıda hem GİDEN hem GELEN
     * olarak bulunabilir — şirketler-arası teslimde (K7a) tam olarak bu olur:
     * A'nın kestiği fatura B'nin gelen kutusuna aynı ETTN'le düşer.
     * Yönsüz bir tekillik kısıtı o döngüyü imkânsız kılardı.
     */
    uniques: [['tenantId', 'direction', 'ettn']],
    indexes: [['companyId'], ['tenantId', 'direction'], ['status']],
  },

  /** Webhook kaydı — plan §7. */
  webhooks: {
    columns: {
      id: { kind: 'text', primaryKey: true },
      tenantId: {
        kind: 'text',
        notNull: true,
        references: { table: 'tenants', column: 'id', onDelete: 'cascade' },
      },
      /** Yalnız bu mükellefin olayları; boşsa kiracının tamamı. */
      companyId: { kind: 'text' },
      url: { kind: 'text', notNull: true },
      /** HMAC-SHA256 anahtarı. Yerel sandbox; panelde görünür. */
      secret: { kind: 'text', notNull: true },
      /** Olay süzgeci; boş dizi = hepsi. */
      events: { kind: 'json', notNull: true, jsonType: 'string[]' },
      active: { kind: 'bool', notNull: true },
      createdAt: { kind: 'ts', notNull: true, default: 'now' },
    },
    indexes: [['tenantId']],
  },

  /**
   * Teslim günlüğü — plan §7: *"panelde tam teslim geçmişi + ELLE yeniden gönderme"*.
   * Her DENEME değil, her OLAY bir satırdır; denemeler `attempt` ile sayılır ve
   * son sonuç satırda tutulur (panelin okuması gereken şey budur).
   */
  webhook_deliveries: {
    columns: {
      id: { kind: 'text', primaryKey: true },
      tenantId: {
        kind: 'text',
        notNull: true,
        references: { table: 'tenants', column: 'id', onDelete: 'cascade' },
      },
      webhookId: {
        kind: 'text',
        notNull: true,
        references: { table: 'webhooks', column: 'id', onDelete: 'cascade' },
      },
      /** Kiracı içinde monoton artan olay sırası (plan §7). */
      sequence: { kind: 'int', notNull: true },
      eventType: { kind: 'text', notNull: true },
      documentId: { kind: 'text' },
      /** Olay anındaki belge sürümü — tüketici tazeliği bundan anlar. */
      documentVersion: { kind: 'int' },
      payload: { kind: 'json', notNull: true, jsonType: 'unknown' },
      /** `pending` · `delivered` · `retrying` · `dead` */
      status: { kind: 'text', notNull: true },
      attempt: { kind: 'int', notNull: true },
      httpStatus: { kind: 'int' },
      error: { kind: 'text' },
      nextAttemptAt: { kind: 'ts' },
      deliveredAt: { kind: 'ts' },
      createdAt: { kind: 'ts', notNull: true, default: 'now' },
      updatedAt: { kind: 'ts', notNull: true, default: 'now' },
    },
    indexes: [['tenantId'], ['webhookId'], ['status']],
  },

  /**
   * 🔑 Tohum webhook alıcısı (plan K13: "çalışan webhook alıcısı").
   * Mock kendi webhook'unu kendi yutabilsin diye; geliştirici kendi sunucusunu
   * kurmadan da teslimi, imzayı ve yeniden denemeyi GÖREBİLİR.
   */
  webhook_sink_events: {
    columns: {
      id: { kind: 'text', primaryKey: true },
      receivedAt: { kind: 'ts', notNull: true, default: 'now' },
      eventType: { kind: 'text', notNull: true },
      sequence: { kind: 'int' },
      /** İmza doğrulaması alıcı tarafında YAPILIR ve sonucu burada durur. */
      signatureValid: { kind: 'bool', notNull: true },
      signatureError: { kind: 'text' },
      body: { kind: 'json', notNull: true, jsonType: 'unknown' },
    },
  },

  /**
   * 🔑 İSTEK GÜNLÜĞÜ — plan §8.
   *
   * *"Geliştirici ne gönderdi, biz ne döndük (ham). Entegrasyon hata
   * ayıklamasında en çok işe yarayan şey budur ve çoğu sandbox'ta YOKTUR."*
   *
   * Bu tablo panelin "ne oldu" sorusuna verdiği en dürüst cevaptır: yorumlanmış
   * bir özet değil, isteğin ve yanıtın kendisi.
   */
  request_log: {
    columns: {
      id: { kind: 'text', primaryKey: true },
      /** Kimliği çözülebildiyse kiracı; çözülemediyse null (401'ler de kaydedilir). */
      tenantId: { kind: 'text' },
      at: { kind: 'ts', notNull: true, default: 'now' },
      method: { kind: 'text', notNull: true },
      url: { kind: 'text', notNull: true },
      status: { kind: 'int', notNull: true },
      durationMs: { kind: 'int', notNull: true },
      /** Hata gövdesindeki `errorCode` — günlükte süzmek için ayrı kolon. */
      errorCode: { kind: 'text' },
      /** ⚠️ Gizli değerler MASKELENİR (`auth.ts` başlıkları). */
      requestHeaders: { kind: 'json', notNull: true, jsonType: 'Record<string, string>' },
      requestBody: { kind: 'text' },
      responseBody: { kind: 'text' },
      /** İstek hangi mükellef bağlamındaydı (`X-Company`). */
      companyVkn: { kind: 'text' },
    },
    indexes: [['tenantId'], ['at']],
  },

  /**
   * Belge olay geçmişi — panelin "NEDEN oldu" sorusuna cevabı.
   *
   * Motor her geçişte bir satır yazar: hangi kural, hangi ham GİB kodu, hangi
   * alarm. Durumun kendisi `documents.status`'ta durur; burada o duruma NASIL
   * gelindiği durur. İkisi ayrı sorulardır ve panel ikisini de cevaplamalıdır.
   */
  document_events: {
    columns: {
      id: { kind: 'text', primaryKey: true },
      tenantId: { kind: 'text', notNull: true },
      documentId: { kind: 'text', notNull: true },
      at: { kind: 'ts', notNull: true, default: 'now' },
      /** Sözlükteki geçiş satırı kimliği (G9, L11, Y2/Y3 …) — izlenebilirlik. */
      ruleId: { kind: 'text', notNull: true },
      /** `status` | `reply` — hangi eksen yürüdü. */
      axis: { kind: 'text', notNull: true },
      fromValue: { kind: 'text', notNull: true },
      toValue: { kind: 'text', notNull: true },
      rawGibCode: { kind: 'int' },
      alarm: { kind: 'text' },
      documentVersion: { kind: 'int', notNull: true },
    },
    indexes: [['documentId'], ['tenantId']],
  },
} as const satisfies Record<string, TableSpec>;

export type SchemaSpec = typeof schemaSpec;
export type TableName = keyof SchemaSpec & string;

/** camelCase → snake_case. DB kolon/indeks adları bundan türer. */
export function toSnakeCase(name: string): string {
  return name.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`);
}

/**
 * Şema sürümü — tarifin içeriğinden türetilir, elle güncellenmez.
 * Mevcut verinin şeması eskiyse açılışta SESSİZ bozulma yerine net hata verilir.
 */
export function schemaFingerprint(): string {
  const canonical = JSON.stringify(
    Object.entries(schemaSpec)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([table, def]) => [
        table,
        Object.entries(def.columns)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([col, raw]) => {
            const c = raw as ColumnSpec;
            return [col, c.kind, !!c.primaryKey, !!c.notNull, !!c.unique, c.references?.table ?? null];
          }),
        (def as TableSpec).uniques ?? [],
        (def as TableSpec).indexes ?? [],
      ]),
  );
  // FNV-1a — kriptografik değil, yalnız "değişti mi" sorusuna cevap.
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
