/**
 * OpenAPI 3.1 belgesi — API'nin makinece okunan TEK tarifi.
 *
 * 🔴 KOPYA YOK: durumlar, hata kodları, senaryolar, webhook olayları, profiller
 * ve geçiş kuralları burada YENİDEN YAZILMAZ; sunucunun kendi sabitlerinden
 * türetilir. Elle yazılan tek şey uçların şeklidir — ve o şeklin gerçek yanıtlarla
 * örtüştüğünü `openapi.test.ts` ölçer (rota eşliği + yanıt sözleşmesi). Belge
 * ile sunucu ayrışırsa test kırmızıya döner; ayrışma sessiz kalamaz.
 *
 * Bu belge üç yere akar: `/openapi.json`, `/docs` (Scalar) ve `/llms-full.txt`.
 */
import { ERROR_CATALOG } from '../errors.js';
import { DIRECTIONS, DOCUMENT_TYPES, REPLY_STATUSES, WRITABLE_DOC_STATUSES } from '../status.js';
import { SCENARIOS, SELECTABLE_SCENARIOS } from '../engine/scenarios.js';
import { MAX_ATTEMPTS, RETRY_DELAYS_MS, WEBHOOK_EVENTS } from '../webhooks/dispatcher.js';
import {
  DELIVERY_HEADER,
  EVENT_HEADER,
  SEQUENCE_HEADER,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} from '../webhooks/signature.js';
import { INVOICE_PROFILE_IDS } from '../profiles.js';
import { SEED_TENANT_API_KEY } from '../seed.js';

type Schema = Record<string, unknown>;

/* ── Küçük yardımcılar ─────────────────────────────────────────────────── */

const str = (description?: string): Schema => ({ type: 'string', ...(description ? { description } : {}) });
const nstr = (description?: string): Schema => ({ type: ['string', 'null'], ...(description ? { description } : {}) });
const nint = (description?: string): Schema => ({ type: ['integer', 'null'], ...(description ? { description } : {}) });
const bool = (description?: string): Schema => ({ type: 'boolean', ...(description ? { description } : {}) });
const dt = (description?: string): Schema => ({ type: 'string', format: 'date-time', ...(description ? { description } : {}) });
const ndt = (description?: string): Schema => ({ type: ['string', 'null'], format: 'date-time', ...(description ? { description } : {}) });
const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });

/** Yanıt nesnesi: bütün alanlar ZORUNLU ve fazlası YASAK — sözleşme testi iki yönlü ölçer. */
function strict(properties: Record<string, Schema>, description?: string): Schema {
  return {
    type: 'object',
    ...(description ? { description } : {}),
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

const json = (schema: Schema, description = 'Başarılı') => ({
  description,
  content: { 'application/json': { schema } },
});

/** Hata yanıtı — hangi kodların bu uçta beklenebileceği açıkça yazılır. */
const errorResponse = (codes: readonly ErrorCodeName[]) => ({
  description:
    'Hata. Beklenebilecek `errorCode` değerleri: ' +
    codes.map((c) => `\`${c}\` (${ERROR_CATALOG[c].status})`).join(', ') +
    '. Tam katalog: `components.schemas.ErrorCode`.',
  content: { 'application/json': { schema: ref('Error') } },
});

type ErrorCodeName = keyof typeof ERROR_CATALOG;
const AUTH_ERRORS: ErrorCodeName[] = ['MISSING_API_KEY', 'INVALID_API_KEY', 'TENANT_AMBIGUOUS'];
const COMPANY_ERRORS: ErrorCodeName[] = ['BRANCH_REQUIRED', 'INVALID_VKN', 'CONTEXT'];

/* ── Ortak başlık/parametre tanımları ──────────────────────────────────── */

const H_COMPANY = {
  name: 'X-Company',
  in: 'header',
  description:
    'İşlemin yapıldığı mükellefin VKN/TCKN\'si. Kiracı anahtarı muhasebe yazılımını, ' +
    'bu başlık o yazılımın hangi müşterisi adına konuşulduğunu seçer (MimForge tenant→branch modeli).',
  schema: { type: 'string', pattern: '^[0-9]{10,11}$', example: '1111111111' },
};

const H_SCENARIO = {
  name: 'X-Scenario',
  in: 'header',
  required: false,
  description:
    'Belgenin izleyeceği durum makinesi senaryosu. Verilmezse `happy`. ' +
    'Katalog: `GET /v1/_sandbox/scenarios`.',
  schema: { type: 'string', enum: [...SELECTABLE_SCENARIOS] },
};

const P_ID = (what: string) => ({
  name: 'id',
  in: 'path',
  required: true,
  description: `${what} kimliği (\`doc_…\` biçiminde; ETTN DEĞİL).`,
  schema: { type: 'string', example: 'doc_7c74c707-7aef-47dd-abe7-33ac542d33f0' },
});

/* ── Şemalar ───────────────────────────────────────────────────────────── */

const DOC_STATUS_ENUM = [...WRITABLE_DOC_STATUSES];

const schemas: Record<string, Schema> = {
  ErrorCode: {
    type: 'string',
    enum: Object.keys(ERROR_CATALOG),
    description:
      'Kararlı, İngilizce hata kodu. `reason` insan metnidir ve değişebilir — ' +
      'dallanmayı DAİMA `errorCode` üzerinden yapın.',
  },
  Error: {
    type: 'object',
    properties: {
      errorCode: ref('ErrorCode'),
      reason: str('Türkçe açıklama. Kod içinde dallanma için KULLANMAYIN.'),
      errors: {
        type: 'array',
        description: 'Alan düzeyinde hatalar (varsa).',
        items: strict({ field: str(), reason: str() }),
      },
    },
    required: ['errorCode', 'reason'],
    additionalProperties: false,
  },

  DocStatus: {
    type: 'string',
    enum: DOC_STATUS_ENUM,
    description:
      'Belge durumu (MimForge sözlüğünden ÖLÇÜLDÜ). 🔴 Belge düzleminde `FAILED` YOKTUR; ' +
      'süre dolması belgeyi askıda bırakır. `SEND_FAILED` terminal değildir — `resend` ile çıkılır.',
  },
  ReplyStatus: { type: 'string', enum: [...REPLY_STATUSES] },
  Direction: { type: 'string', enum: [...DIRECTIONS] },
  DocumentType: { type: 'string', enum: [...DOCUMENT_TYPES] },
  ScenarioName: { type: 'string', enum: Object.keys(SCENARIOS) },
  WebhookEvent: { type: 'string', enum: [...WEBHOOK_EVENTS] },
  InvoiceProfileId: { type: 'string', enum: [...INVOICE_PROFILE_IDS] },

  Company: strict({
    vkn: str('10 hane VKN veya 11 hane TCKN'),
    title: str(),
    address: strict({
      street: nstr(),
      district: nstr(),
      city: nstr(),
      country: str(),
      taxOffice: nstr(),
    }),
    aliases: strict({
      pk: { type: 'array', items: str(), description: 'Posta kutusu etiketleri' },
      gb: { type: 'array', items: str(), description: 'Gönderici birim etiketleri' },
    }),
    profiles: { type: 'array', items: ref('InvoiceProfileId') },
    templateId: nstr('Görüntü şablonu: `templateId@version`'),
    seriesPrefix: nstr('Numaralama serisi öneki (örn. `ABC`)'),
    eInvoiceRegistered: bool('e-Fatura sicilinde mi. Değilse belgeleri e-Arşiv yoluna düşer.'),
    createdAt: dt(),
    updatedAt: dt(),
  }),
  CompanyInput: {
    type: 'object',
    required: ['vkn', 'title', 'eInvoiceRegistered'],
    additionalProperties: false,
    properties: {
      vkn: { type: 'string', pattern: '^[0-9]{10,11}$', example: '3333333333' },
      title: { type: 'string', example: 'ÖRNEK TİCARET A.Ş.' },
      addressStreet: str(),
      addressDistrict: str(),
      addressCity: str(),
      addressCountry: { type: 'string', default: 'Türkiye' },
      taxOffice: str(),
      pkAliases: { type: 'array', items: str(), example: ['urn:mail:defaultpk@ornek.com.tr'] },
      gbAliases: { type: 'array', items: str(), example: ['urn:mail:defaultgb@ornek.com.tr'] },
      profiles: { type: 'array', items: ref('InvoiceProfileId'), example: ['TEMELFATURA', 'TICARIFATURA'] },
      templateId: str(),
      seriesPrefix: { type: 'string', example: 'ORN' },
      eInvoiceRegistered: { type: 'boolean', example: true },
    },
  },

  Document: strict({
    id: str('Mock kimliği (`doc_…`). Diğer uçlar bunu alır.'),
    ettn: str('Evrensel Tekil Tanımlama Numarası (UUID). Yön ile birlikte tekildir.'),
    direction: ref('Direction'),
    type: ref('DocumentType'),
    profile: nstr(),
    typeCode: nstr(),
    status: ref('DocStatus'),
    rawGibCode: nint('Son ham GİB kodu. 🔑 Teslim çıpası 1220\'dir; 1300 zarf kapanışıdır; 1230 teslimi GERİ ALIR.'),
    replyStatus: ref('ReplyStatus'),
    documentNumber: nstr('Seri + yıl + sıra, örn. `ORN2026000000301`'),
    issueDate: str('YYYY-MM-DD'),
    senderVkn: nstr(),
    receiverVkn: nstr(),
    currencyCode: nstr(),
    payableAmount: nstr('Ödenecek tutar, ondalık metin olarak (`"15300.00"`)'),
    sourceKind: str('`json` | `ubl` | `inbound` | `generated`'),
    generated: bool('Trafik üreteci mi üretti. Kendi trafiğinizle karışmasın diye her yerde işaretli.'),
    generatedScenario: nstr(),
    validation: strict({ appliedXsd: nstr(), appliedSchematron: nstr() }),
    deliveredAt: ndt('Teslim anı (1220). 1230 gelirse TEMİZLENİR.'),
    signature: strict({
      kind: nstr('`test-certificate` ya da null'),
      signedAt: ndt(),
      chainValid: { type: 'boolean', const: false, description: '🔴 Her zaman false — imza TEST sertifikasıyladır.' },
    }),
    engine: strict({
      scenario: nstr(),
      nextState: nstr('Motorun bir sonraki adımı (senaryo#adım). null = adım yok.'),
      nextAt: ndt('Bir sonraki adımın vadesi (SANAL saat).'),
    }),
    createdAt: dt(),
    updatedAt: dt(),
  }),

  InboxDocument: strict({
    id: str(),
    ettn: str(),
    type: ref('DocumentType'),
    profile: nstr(),
    typeCode: nstr(),
    status: { ...ref('DocStatus'), description: '🔑 `RECEIVED` = zarf alındı · `DELIVERED` = S_APR teyitlendi (İKİ ADIM).' },
    rawGibCode: nint(),
    replyStatus: ref('ReplyStatus'),
    replyDecision: nstr(),
    replyReason: nstr(),
    documentNumber: nstr(),
    issueDate: str(),
    senderVkn: nstr(),
    receiverVkn: nstr(),
    payableAmount: nstr(),
    currencyCode: nstr(),
    systemResponse: strict(
      { sentAt: ndt(), confirmedAt: ndt(), code: nint('Teyit kodu: 1200 veya 1300') },
      'S_APR (sistem yanıtı) izleme — gelen akışın ikinci adımı.',
    ),
    replyable: strict(
      { can: bool(), reason: nstr('Yanıt verilemiyorsa neden (örn. `DOCUMENT_NOT_SETTLED`).') },
      'Yanıt kapısı — yanıt vermeden ÖNCE okuyun.',
    ),
    deliveredAt: ndt(),
    replyDeadlineAt: ndt('Ticari yanıt için son an (TTK md.21, 8 gün).'),
    sourceDocumentId: nstr('Bu belge mock içinde başka bir kiracının GİDEN belgesinden doğduysa onun kimliği.'),
    generated: bool(),
    generatedScenario: nstr(),
    createdAt: dt(),
  }),

  DocumentAccepted: strict(
    {
      ettn: str(),
      id: str(),
      status: ref('DocStatus'),
      scenario: ref('ScenarioName'),
    },
    'Belge kabul edildi (202). Durum ASENKRON ilerler: webhook dinleyin ya da `GET /v1/documents/{id}` yoklayın.',
  ),

  DocumentEvent: strict({
    at: dt('Olay anı (SANAL saat).'),
    ruleId: str('Geçiş kuralı kimliği (G5…G16, L10, L11). `/llms-full.txt` geçiş tablosuna bakın.'),
    axis: str('`status` ya da `reply`'),
    from: nstr(),
    to: nstr(),
    rawGibCode: nint(),
    alarm: nstr(),
    documentVersion: nint(),
  }),

  Webhook: strict({
    id: str(),
    url: str(),
    secret: str('HMAC anahtarı. Yerel sandbox olduğu için görünür.'),
    events: { type: 'array', items: ref('WebhookEvent') },
    companyVkn: nstr('Şirket süzgeci (boş = kiracının tüm şirketleri).'),
    active: bool(),
    createdAt: dt(),
  }),
  WebhookInput: {
    type: 'object',
    required: ['url'],
    additionalProperties: false,
    properties: {
      url: { type: 'string', format: 'uri', example: 'http://host.docker.internal:3000/webhooks/mimmock' },
      events: { type: 'array', items: ref('WebhookEvent'), description: 'Boş = tüm olaylar.' },
      companyVkn: str('Yalnız bu mükellefin olayları.'),
      secret: str('Verilmezse üretilir (`whsec_…`).'),
      active: { type: 'boolean', default: true },
    },
  },
  Delivery: strict({
    id: str(),
    webhookId: str(),
    sequence: { type: 'integer', description: 'Kiracı içinde monoton. Sıralama garanti DEĞİL — bununla sıralayın.' },
    event: ref('WebhookEvent'),
    documentId: nstr(),
    documentVersion: nint('Aynı belge için eski sürümlü olayı yok sayın.'),
    status: { type: 'string', enum: ['pending', 'retrying', 'delivered', 'dead'] },
    attempt: { type: 'integer' },
    maxAttempts: { type: 'integer', const: MAX_ATTEMPTS },
    httpStatus: nint(),
    error: nstr(),
    nextAttemptAt: ndt(),
    deliveredAt: ndt(),
    createdAt: dt(),
    payload: { type: 'object', description: 'Alıcıya gönderilen JSON gövde.' },
  }),

  Scenario: strict({
    selectable: bool('`X-Scenario` ile seçilebilir mi. Diğerlerini motor otomatik bağlar.'),
    name: ref('ScenarioName'),
    description: str(),
    steps: {
      type: 'array',
      items: strict({
        event: str(),
        rawGibCode: nint(),
        delayMs: { type: 'integer' },
        alarm: nstr(),
        note: nstr(),
      }),
    },
    endsOpen: bool('true = senaryo AÇIK biter (belge askıda kalır — hata değil).'),
  }),

  Clock: strict({
    now: dt('SANAL şimdi — motorun ve vadelerin saati.'),
    offsetMs: { type: 'integer', description: 'Sanal saatin gerçek saatten sapması.' },
    real: dt('GERÇEK şimdi. 🔴 Webhook imza damgaları bu saatle atılır.'),
  }),

  Transition: {
    type: 'object',
    description: 'Motorun uyguladığı geçiş (ayrıntı `DocumentEvent` ile aynı anlamdadır).',
  },

  RequestLogEntry: strict({
    id: str(),
    at: dt(),
    method: str(),
    url: str(),
    status: { type: 'integer' },
    durationMs: { type: 'integer' },
    errorCode: nstr(),
    companyVkn: nstr(),
    requestHeaders: {
      type: 'object',
      additionalProperties: { type: 'string' },
      description: '`authorization`, `x-panel-token`, `x-mimmock-signature` MASKELİ.',
    },
    requestBody: nstr('4000 karakterde kırpılır.'),
    responseBody: nstr('4000 karakterde kırpılır.'),
  }),

  Health: strict({
    status: { type: 'string', enum: ['ok', 'degraded'] },
    api: str(),
    dialect: { type: 'string', enum: ['sqlite', 'pg'] },
    schemaFingerprint: str(),
    panelTokenRequired: bool(),
    panelAvailable: bool(),
    mimkit: strict(
      {
        url: nstr('Bağlı mimkit adresi.'),
        ready: bool('Erişildi VE anahtar geçerli. false ise belge alma 503 döner.'),
        offlineAllowed: bool('`MIMMOCK_ALLOW_OFFLINE=1` ile bilerek çevrimdışı mı.'),
      },
      'Tek dış bağımlılık: doğrulama (XSD + şematron), numaralama ve görüntü.',
    ),
  }),

  JsonInvoiceInput: {
    type: 'object',
    description:
      'Basit fatura girdisi — **json2ubl-ts `SimpleInvoiceInput`**. Mock bunu UBL-TR\'ye çevirir, ' +
      'CANLI şematrondan geçirir, imzalar ve durum makinesine sokar. Aşağıda sık kullanılan alt küme ' +
      'var; kütüphanenin kabul ettiği diğer alanlar (ÖTV, tevkifat, e-Arşiv bilgisi, SGK …) da geçerlidir.',
    required: ['id', 'uuid', 'sender', 'customer', 'lines'],
    additionalProperties: true,
    properties: {
      id: {
        type: 'string',
        description:
          'Belge numarası: 3 harf seri + 4 hane yıl + 9 hane sıra. JSON yolunda ZORUNLU ' +
          '(ölçüldü: verilmezse `JSON_BUILD_FAILED`). Yıl, `datetime` yılıyla aynı olmalı.',
        example: 'ORN2026000000001',
      },
      uuid: {
        type: 'string',
        format: 'uuid',
        description:
          'ETTN. JSON yolunda ZORUNLU (ölçüldü: verilmezse `JSON_BUILD_FAILED`). Her yeni belge için ' +
          'YENİ bir UUID üretin — aynı ETTN ikinci kez `409 DUPLICATE_UUID` alır. B sınıfı bir hatadan ' +
          'sonra düzeltilmiş belgeyi AYNI ETTN ile gönderirsiniz.',
        example: '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f',
      },
      datetime: {
        type: 'string',
        description: 'Düzenleme anı `YYYY-MM-DDTHH:mm:ss`. 🔴 GELECEK tarih reddedilir.',
        example: '2026-09-20T10:00:00',
      },
      profile: { ...ref('InvoiceProfileId'), default: 'TEMELFATURA' },
      type: { type: 'string', example: 'SATIS', description: 'Fatura tipi: SATIS, IADE, TEVKIFAT, ISTISNA …' },
      currencyCode: { type: 'string', default: 'TRY' },
      exchangeRate: { type: 'number', description: 'Döviz ise zorunlu.' },
      scenario: { ...ref('ScenarioName'), description: '`X-Scenario` başlığının gövdedeki eşi.' },
      seriesPrefix: str('Numaralama serisi öneki (numarasız akış için).'),
      notes: { type: 'array', items: str() },
      sender: ref('JsonParty'),
      customer: ref('JsonParty'),
      lines: { type: 'array', minItems: 1, items: ref('JsonLine') },
    },
  },
  JsonParty: {
    type: 'object',
    required: ['taxNumber', 'name', 'address', 'district', 'city'],
    additionalProperties: true,
    properties: {
      taxNumber: { type: 'string', description: 'VKN (10) / TCKN (11). Gönderen = `X-Company` olmalı.' },
      name: str(),
      taxOffice: str('VKN için zorunlu.'),
      address: str(),
      district: str(),
      city: str(),
      country: { type: 'string', default: 'Türkiye' },
      zipCode: str(),
      email: str(),
      phone: str(),
      alias: str('Posta kutusu etiketi, örn. `urn:mail:defaultpk@firma.com.tr`'),
    },
  },
  JsonLine: {
    type: 'object',
    required: ['name', 'quantity', 'price', 'kdvPercent'],
    additionalProperties: true,
    properties: {
      name: str(),
      quantity: { type: 'number' },
      price: { type: 'number', description: 'Birim fiyat (KDV hariç).' },
      unitCode: { type: 'string', default: 'Adet', description: '`Adet` ya da UBL kodu (`C62`).' },
      kdvPercent: { type: 'number', example: 20 },
      allowancePercent: { type: 'number', description: 'Satır iskontosu (%).' },
      withholdingTaxCode: { type: 'string', example: '603', description: 'KDV tevkifat kodu.' },
      description: str(),
    },
  },
};

/* ── Örnekler ──────────────────────────────────────────────────────────── */

/**
 * `/docs`'taki "Try it" bu örnekle gider — `openapi.live.test.ts` örneğin
 * gerçekten 202 aldığını ÖLÇER. Kabul edilmeyen bir örnek, belgeyi açan herkesin
 * ilk denemesini bozardı.
 */
export const EXAMPLE_INVOICE = {
  id: 'ORN2026000000001',
  uuid: '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f',
  datetime: '2026-09-20T10:00:00',
  profile: 'TEMELFATURA',
  type: 'SATIS',
  currencyCode: 'TRY',
  sender: {
    taxNumber: '1111111111',
    name: 'DENEME GÖNDERİCİ A.Ş.',
    taxOffice: 'DENEME VERGİ DAİRESİ',
    address: 'Deneme Mah. No:1',
    district: 'Çankaya',
    city: 'Ankara',
  },
  customer: {
    taxNumber: '2222222222',
    name: 'DENEME ALICI LTD. ŞTİ.',
    taxOffice: 'DENEME VERGİ DAİRESİ',
    address: 'Deneme Cad. No:2',
    district: 'Kadıköy',
    city: 'İstanbul',
  },
  lines: [{ name: 'Danışmanlık hizmeti', quantity: 1, price: 1000, unitCode: 'Adet', kdvPercent: 20 }],
};

/* ── Uçlar ─────────────────────────────────────────────────────────────── */

const security = [{ bearerAuth: [] }];

function paths(): Record<string, Record<string, unknown>> {
  return {
    '/healthz': {
      get: {
        tags: ['Sistem'],
        summary: 'Sağlık ve bağımlılık durumu',
        description:
          'Kimlik istemez. mimkit erişilemezse ya da anahtar reddedilirse **503 + `degraded`** döner — ' +
          'mock sessizce düşük sadakatte çalışmaz. Container sağlık kontrolü bunu kullanır.',
        security: [],
        responses: {
          200: json(ref('Health')),
          503: json(ref('Health'), 'mimkit hazır değil (degraded)'),
        },
      },
    },

    '/v1': {
      get: {
        tags: ['Sistem'],
        summary: 'API kök dizini — belgelerin adresleri',
        description: 'Yalnız taban adresi bilen bir ajan nereye bakacağını buradan öğrenir.',
        security: [],
        responses: {
          200: json(
            strict({
              api: str(),
              note: str(),
              docs: strict({
                llms: str(), llmsFull: str(), openapi: str(), reference: str(), panel: str(), health: str(),
              }),
              auth: str(),
            }),
          ),
        },
      },
    },

    /* ── Şirketler ── */
    '/v1/companies': {
      get: {
        tags: ['Şirketler'],
        summary: 'Kiracının mükelleflerini listele',
        security,
        responses: {
          200: json(strict({ companies: { type: 'array', items: ref('Company') } })),
          401: errorResponse(AUTH_ERRORS),
        },
      },
      post: {
        tags: ['Şirketler'],
        summary: 'Mükellef tanımla',
        description:
          'Mock\'ta "e-Fatura sicili" = bu kiracıda tanımlı VE `eInvoiceRegistered: true` şirketler. ' +
          'Alıcı olarak tanımlı bir şirkete fatura kesilirse belge teslim olunca onun GELEN kutusuna düşer.',
        security,
        requestBody: { required: true, content: { 'application/json': { schema: ref('CompanyInput') } } },
        responses: {
          201: json(ref('Company'), 'Oluşturuldu'),
          400: errorResponse(['VALIDATION_FAILED', 'INVALID_VKN', 'UNKNOWN_PROFILE']),
          409: errorResponse(['COMPANY_EXISTS']),
        },
      },
    },
    '/v1/companies/{vkn}': {
      get: {
        tags: ['Şirketler'],
        summary: 'Tek mükellef',
        security,
        parameters: [{ name: 'vkn', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: json(ref('Company')),
          404: errorResponse(['COMPANY_NOT_FOUND']),
        },
      },
    },

    /* ── Belgeler ── */
    '/v1/documents': {
      post: {
        tags: ['Belgeler'],
        summary: 'Fatura gönder (JSON → UBL)',
        description:
          'Ana yol. Gövde json2ubl-ts ile UBL-TR\'ye çevrilir → **canlı XSD + şematron** → test ' +
          'sertifikasıyla imza → durum makinesi. Kabul **202**\'dir; teslim asenkron gelir ' +
          '(`document.delivered` webhook\'u ya da yoklama).',
        security,
        parameters: [{ ...H_COMPANY, required: true }, H_SCENARIO],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: ref('JsonInvoiceInput'),
              examples: {
                temel: {
                  summary: 'Temel satış faturası',
                  description:
                    'İkinci denemede `uuid` ve `id`\'yi değiştirin — aynı ETTN/numara 409 alır.',
                  value: EXAMPLE_INVOICE,
                },
              },
            },
          },
        },
        responses: {
          202: json(ref('DocumentAccepted'), 'Kabul edildi — durum asenkron ilerler'),
          400: errorResponse([
            'JSON_BUILD_FAILED', 'SCHEMA_INVALID', 'VALIDATION_FAILED', 'SENDER_MISMATCH',
            'RECEIVER_NOT_REGISTERED', 'DOCNO_FORMAT', 'DOCNO_YEAR_MISMATCH', ...COMPANY_ERRORS,
          ]),
          409: errorResponse(['DUPLICATE_UUID', 'DUPLICATE_DOCNO']),
          503: errorResponse(['VALIDATOR_UNAVAILABLE', 'OFFLINE_MODE', 'NUMBERING_UNAVAILABLE']),
        },
      },
      get: {
        tags: ['Belgeler'],
        summary: 'Belgeleri listele',
        description: '`X-Company` verilirse liste o mükellefle sınırlanır. Yeniden eskiye sıralı.',
        security,
        parameters: [
          { ...H_COMPANY, required: false },
          { name: 'direction', in: 'query', schema: ref('Direction') },
          { name: 'status', in: 'query', schema: ref('DocStatus') },
          { name: 'type', in: 'query', schema: ref('DocumentType') },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 200 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: {
          200: json(
            strict({
              documents: { type: 'array', items: ref('Document') },
              page: strict({ total: { type: 'integer' }, limit: { type: 'integer' }, offset: { type: 'integer' } }),
            }),
          ),
        },
      },
    },
    '/v1/documents/ubl': {
      post: {
        tags: ['Belgeler'],
        summary: 'Ham UBL-TR XML gönder',
        description:
          'Kendi UBL\'sini üreten entegrasyonlar için. JSON yoluyla AYNI kapılardan geçer. ' +
          'Belge numarası (`cbc:ID`) yoksa `X-Series-Prefix` ile seriden numara alınır.',
        security,
        parameters: [
          { ...H_COMPANY, required: true },
          H_SCENARIO,
          { name: 'X-Series-Prefix', in: 'header', required: false, schema: { type: 'string' } },
        ],
        requestBody: { required: true, content: { 'application/xml': { schema: { type: 'string' } } } },
        responses: {
          202: json(ref('DocumentAccepted')),
          400: errorResponse(['MALFORMED_XML', 'SCHEMA_INVALID', 'MULTIPLE_TAX_TOTALS', 'TYPE_MISMATCH', ...COMPANY_ERRORS]),
          409: errorResponse(['DUPLICATE_UUID', 'DUPLICATE_DOCNO', 'NO_DEFAULT_SERIES']),
          503: errorResponse(['VALIDATOR_UNAVAILABLE', 'OFFLINE_MODE', 'NUMBERING_UNAVAILABLE']),
        },
      },
    },
    '/v1/documents/{id}': {
      get: {
        tags: ['Belgeler'],
        summary: 'Belge',
        security,
        parameters: [P_ID('Belge')],
        responses: { 200: json(ref('Document')), 404: errorResponse(['DOCUMENT_NOT_FOUND']) },
      },
    },
    '/v1/documents/{id}/history': {
      get: {
        tags: ['Belgeler'],
        summary: 'Olay geçmişi — belge bu duruma NEDEN geldi',
        description: 'Her geçiş: kural kimliği, önceki/sonraki durum, ham GİB kodu, alarm, belge sürümü.',
        security,
        parameters: [P_ID('Belge')],
        responses: { 200: json(strict({ events: { type: 'array', items: ref('DocumentEvent') } })) },
      },
    },
    '/v1/documents/{id}/resend': {
      post: {
        tags: ['Belgeler'],
        summary: 'SEND_FAILED belgeyi yeniden gönder',
        description:
          'Yalnız `SEND_FAILED` + GİDEN. Son ham GİB koduna göre sınıflanır: **A** yeniden gönderilir; ' +
          '**B** (`NEEDS_RESIGN`) belge düzeltilip aynı ETTN ile yeniden POST edilmeli; **C** asla/bekle.',
        security,
        parameters: [P_ID('Belge')],
        responses: {
          200: json(
            strict({
              id: str(),
              ettn: str(),
              status: ref('DocStatus'),
              resendClass: str(),
              applied: { type: 'object' },
            }),
          ),
          404: errorResponse(['DOCUMENT_NOT_FOUND']),
          409: errorResponse(['ALREADY_DELIVERED', 'SEND_IN_PROGRESS', 'NOT_RESENDABLE', 'NEEDS_RESIGN', 'NOT_RESENDABLE_GIB']),
        },
      },
    },
    '/v1/documents/{id}/xml': {
      get: {
        tags: ['Belgeler'],
        summary: 'İmzalı UBL-TR XML',
        description:
          'Yanıt başlığı `X-MimMock-Document-Signature: test-certificate; self-signed; ' +
          'chain-validation-fails-by-design`. İmza yapısı gerçek; zincir doğrulaması KASTEN geçersiz.',
        security,
        parameters: [P_ID('Belge')],
        responses: {
          200: { description: 'UBL-TR', content: { 'application/xml': { schema: { type: 'string' } } } },
          404: errorResponse(['DOCUMENT_NOT_FOUND']),
        },
      },
    },
    '/v1/documents/{id}/html': {
      get: {
        tags: ['Görüntü'],
        summary: 'HTML görüntü (canlı şablon)',
        description: 'Görüntü CANLI mimkit\'ten gelir; mock şablonu kendisi çizmez. Başlık: `X-MimMock-Template`.',
        security,
        parameters: [P_ID('Belge')],
        responses: {
          200: { description: 'HTML', content: { 'text/html': { schema: { type: 'string' } } } },
          404: errorResponse(['DOCUMENT_NOT_FOUND', 'TEMPLATE_NOT_FOUND']),
          503: errorResponse(['TEMPLATE_UNAVAILABLE']),
        },
      },
    },
    '/v1/documents/{id}/pdf': {
      get: {
        tags: ['Görüntü'],
        summary: 'PDF görüntü (canlı şablon)',
        security,
        parameters: [P_ID('Belge')],
        responses: {
          200: { description: 'PDF', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } },
          404: errorResponse(['DOCUMENT_NOT_FOUND', 'TEMPLATE_NOT_FOUND']),
          503: errorResponse(['TEMPLATE_UNAVAILABLE']),
        },
      },
    },
    '/v1/templates': {
      get: {
        tags: ['Görüntü'],
        summary: 'Seçilebilir görüntü şablonları',
        security,
        parameters: [{ ...H_COMPANY, required: false }],
        responses: {
          200: json(strict({ templates: { type: 'array', items: { type: 'object' } } })),
          503: errorResponse(['TEMPLATE_UNAVAILABLE']),
        },
      },
    },

    /* ── Gelen kutusu ── */
    '/v1/inbox': {
      get: {
        tags: ['Gelen kutusu'],
        summary: 'Gelen belgeler',
        description: 'En yeni 100 belge. `X-Company` verilirse o mükellefin kutusu.',
        security,
        parameters: [
          { ...H_COMPANY, required: false },
          { name: 'status', in: 'query', schema: ref('DocStatus') },
          { name: 'replyStatus', in: 'query', schema: ref('ReplyStatus') },
        ],
        responses: { 200: json(strict({ inbox: { type: 'array', items: ref('InboxDocument') } })) },
      },
    },
    '/v1/inbox/{id}': {
      get: {
        tags: ['Gelen kutusu'],
        summary: 'Gelen belge',
        security,
        parameters: [P_ID('Gelen belge')],
        responses: { 200: json(ref('InboxDocument')), 404: errorResponse(['DOCUMENT_NOT_FOUND']) },
      },
    },
    '/v1/inbox/{id}/reply': {
      post: {
        tags: ['Gelen kutusu'],
        summary: 'Ticari kabul / ret',
        description:
          'Kapı SIRASI normatiftir: (1) yalnız `TICARIFATURA` → (2) 🔑 belge `DELIVERED` olmalı ' +
          '(`DOCUMENT_NOT_SETTLED`) → (3) yanıt durumu `AWAITING` → (4) 8 günlük pencere. ' +
          'Önce `replyable` alanını okuyun.',
        security,
        parameters: [P_ID('Gelen belge')],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['decision'],
                additionalProperties: false,
                properties: {
                  decision: { type: 'string', enum: ['ACCEPTED', 'REJECTED'] },
                  reason: str('`REJECTED` için zorunlu.'),
                },
              },
            },
          },
        },
        responses: {
          200: json(ref('InboxDocument')),
          400: errorResponse(['VALIDATION_FAILED', 'EMPTY_REJECT_REASON']),
          404: errorResponse(['DOCUMENT_NOT_FOUND']),
          409: errorResponse(['NOT_COMMERCIAL', 'DOCUMENT_NOT_SETTLED', 'REPLY_IN_PROGRESS', 'ALREADY_REPLIED', 'REPLY_WINDOW_EXPIRED']),
        },
      },
    },

    /* ── Webhook ── */
    '/v1/webhooks': {
      get: {
        tags: ['Webhook'],
        summary: 'Kayıtlı webhook\'lar ve yeniden deneme politikası',
        security,
        responses: {
          200: json(
            strict({
              webhooks: { type: 'array', items: ref('Webhook') },
              retryPolicy: strict({
                delaysMs: { type: 'array', items: { type: 'integer' }, example: [...RETRY_DELAYS_MS] },
                maxAttempts: { type: 'integer', const: MAX_ATTEMPTS },
              }),
            }),
          ),
        },
      },
      post: {
        tags: ['Webhook'],
        summary: 'Webhook kaydet',
        description:
          'Container içinden ana makinenize ulaşmak için `http://host.docker.internal:<port>/…` kullanın.',
        security,
        requestBody: { required: true, content: { 'application/json': { schema: ref('WebhookInput') } } },
        responses: { 201: json(ref('Webhook')), 400: errorResponse(['VALIDATION_FAILED']), 404: errorResponse(['CONTEXT']) },
      },
    },
    '/v1/webhooks/{id}/deliveries': {
      get: {
        tags: ['Webhook'],
        summary: 'Teslim günlüğü',
        security,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: json(strict({ deliveries: { type: 'array', items: ref('Delivery') } })) },
      },
    },
    '/v1/webhooks/{id}/replay': {
      post: {
        tags: ['Webhook'],
        summary: 'Teslimi elle yeniden gönder (ölü mektuptan da)',
        security,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['deliveryId'], additionalProperties: false, properties: { deliveryId: str() } },
            },
          },
        },
        responses: { 200: json(ref('Delivery')), 404: errorResponse(['NOT_FOUND']) },
      },
    },

    /* ── Sandbox (yalnız mock'ta) ── */
    '/v1/_sandbox/scenarios': {
      get: {
        tags: ['Sandbox'],
        summary: 'Senaryo kataloğu',
        security,
        responses: {
          200: json(strict({ selectable: { type: 'array', items: ref('ScenarioName') }, scenarios: { type: 'array', items: ref('Scenario') } })),
        },
      },
    },
    '/v1/_sandbox/clock': {
      get: {
        tags: ['Sandbox'],
        summary: 'Sanal saati oku',
        security,
        responses: { 200: json(ref('Clock')) },
      },
      post: {
        tags: ['Sandbox'],
        summary: 'Sanal saati ilerlet / ayarla / sıfırla',
        description:
          '15 günlük bir bekleyişi bir saniyede atlatır; vadesi gelen TÜM geçişler hemen ateşlenir. ' +
          'Webhook imza damgaları GERÇEK saatte kalır (±5 dk pencere bozulmaz).',
        security,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  advanceMs: { type: 'integer' },
                  advanceDays: { type: 'number', example: 16 },
                  to: { type: 'string', format: 'date-time' },
                  reset: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          200: json(
            strict({
              now: dt(),
              offsetMs: { type: 'integer' },
              appliedTransitions: { type: 'array', items: { type: 'object' } },
            }),
          ),
          400: errorResponse(['VALIDATION_FAILED']),
        },
      },
    },
    '/v1/_sandbox/documents/{id}/advance': {
      post: {
        tags: ['Sandbox'],
        summary: 'Belgeyi bir adım ilerlet',
        security,
        parameters: [P_ID('Belge')],
        responses: {
          200: json(strict({ applied: {}, status: ref('DocStatus'), rawGibCode: nint(), nextState: nstr(), nextAt: ndt() })),
          404: errorResponse(['DOCUMENT_NOT_FOUND']),
        },
      },
    },
    '/v1/_sandbox/documents/{id}/fail': {
      post: {
        tags: ['Sandbox'],
        summary: 'Ham GİB kodu enjekte et (arıza/geri alma)',
        description:
          'Kod, GİB durum sorgusundan dönmüş gibi uygulanır. Örnekler: `1150` → `SEND_FAILED`; ' +
          '`1230` (yalnız `DELIVERED`\'dan) → teslim GERİ ALINIR; ara kodlar (1000/1100/1210) durumu değiştirmez.',
        security,
        parameters: [P_ID('Belge')],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['rawGibCode'],
                additionalProperties: false,
                properties: { rawGibCode: { type: 'integer', example: 1230 }, reason: str() },
              },
            },
          },
        },
        responses: {
          200: json({
            type: 'object',
            additionalProperties: false,
            required: ['applied', 'status', 'rawGibCode'],
            properties: {
              applied: { description: 'Uygulanan geçiş; kod bu durumda geçiş üretmediyse null.' },
              status: ref('DocStatus'),
              rawGibCode: nint(),
              note: str('YALNIZ geçiş uygulanmadığında gelir (ör. ara kodlar 1000/1100/1210).'),
            },
          }),
          400: errorResponse(['VALIDATION_FAILED']),
          404: errorResponse(['DOCUMENT_NOT_FOUND']),
        },
      },
    },
    '/v1/_sandbox/documents/{id}/scenario': {
      post: {
        tags: ['Sandbox'],
        summary: 'Belgenin senaryosunu değiştir',
        security,
        parameters: [P_ID('Belge')],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['scenario'], additionalProperties: false, properties: { scenario: ref('ScenarioName') } },
            },
          },
        },
        responses: {
          200: json(strict({ scenario: ref('ScenarioName'), nextState: nstr(), nextAt: ndt() })),
          400: errorResponse(['VALIDATION_FAILED']),
          404: errorResponse(['DOCUMENT_NOT_FOUND']),
        },
      },
    },
    '/v1/_sandbox/inbox': {
      post: {
        tags: ['Sandbox'],
        summary: 'Gelen kutusuna ham XML enjekte et',
        description:
          'Otomatik testler için: `X-Company` mükellefinin gelen kutusuna, dışarıdan gelmiş gibi bir belge ' +
          'düşürür. İlk durum `RECEIVED`; `DELIVERED` için S_APR teyidi beklenir. `X-Scenario: ' +
          'inbound_sr_stalled` ile teyidin hiç gelmediği hâl sınanır.',
        security,
        parameters: [
          { ...H_COMPANY, required: true },
          { name: 'X-Scenario', in: 'header', schema: { type: 'string', enum: ['inbound_happy', 'inbound_sr_stalled'] } },
        ],
        requestBody: { required: true, content: { 'application/xml': { schema: { type: 'string' } } } },
        responses: {
          202: json(strict({ id: str(), ettn: str(), status: ref('DocStatus'), replyStatus: ref('ReplyStatus'), scenario: str() })),
          400: errorResponse(['MALFORMED_XML', ...COMPANY_ERRORS]),
        },
      },
    },
    '/v1/_sandbox/traffic': {
      post: {
        tags: ['Sandbox'],
        summary: 'Trafik üret (bir tur)',
        description:
          'Tanımlı şirketlere dışarıdan gelmiş gibi GERÇEK, canlı mimkit doğrulamasından geçmiş UBL üretir. ' +
          'Üretilen her belge `generated: true` ile işaretlidir.',
        security,
        responses: {
          200: json(
            strict({
              produced: { type: 'integer' },
              duplicate: { type: 'integer' },
              rejected: { type: 'integer' },
              results: { type: 'array', items: { type: 'object' } },
              stats: { type: 'object' },
            }),
          ),
          503: errorResponse(['VALIDATOR_UNAVAILABLE']),
        },
      },
    },
    '/v1/_sandbox/traffic/reset': {
      post: {
        tags: ['Sandbox'],
        summary: 'Trafik tohumunu sıfırla (aynı akışı baştan üret)',
        security,
        responses: { 200: json(strict({ reset: { type: 'boolean', const: true }, seed: str() })) },
      },
    },
    '/v1/_sandbox/reset': {
      post: {
        tags: ['Sandbox'],
        summary: 'TÜM veriyi sil, tohumu yeniden yaz',
        description: '🔴 Geri alınamaz. Şema düşürülüp yeniden kurulur; sanal saat sıfırlanır.',
        security,
        responses: {
          200: json(strict({ reset: { type: 'boolean', const: true }, seeded: bool(), tenantApiKey: nstr() })),
        },
      },
    },
    '/v1/_sandbox/requests': {
      get: {
        tags: ['Sandbox'],
        summary: 'Ham istek günlüğü — ne gönderdiniz, ne döndük',
        security,
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 200 } },
          { name: 'errorsOnly', in: 'query', schema: { type: 'string', enum: ['1'] } },
          { name: 'status', in: 'query', schema: { type: 'integer' }, description: '`errorsOnly=1` ile birlikte' },
        ],
        responses: { 200: json(strict({ requests: { type: 'array', items: ref('RequestLogEntry') } })) },
      },
    },
    '/v1/_sandbox/webhook-sink': {
      get: {
        tags: ['Sandbox'],
        summary: 'Tohum webhook alıcısının aldıkları',
        description:
          'Mock kendi webhook\'unu kendi yutar ve imzayı GERÇEKTEN doğrular — kendi sunucunuzu ' +
          'kurmadan teslimi ve imzayı görebilirsiniz.',
        security,
        responses: {
          200: json(
            strict({
              events: {
                type: 'array',
                items: strict({
                  id: str(),
                  receivedAt: dt(),
                  event: str(),
                  sequence: nint(),
                  signatureValid: bool(),
                  signatureError: nstr(),
                  body: {},
                }),
              },
            }),
          ),
        },
      },
      post: {
        tags: ['Sandbox'],
        summary: 'Tohum webhook alıcısı (mock\'un kendisi çağırır)',
        description: 'Kimlik istemez. Geçersiz imzayı **400** ile reddeder — bozuk imzalayıcı görünmez kalmasın.',
        security: [],
        requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
        responses: {
          200: json(strict({ accepted: { type: 'boolean', const: true } })),
          400: json(strict({ accepted: { type: 'boolean', const: false }, signature: { type: 'object' } }), 'İmza geçersiz'),
        },
      },
    },
  };
}

/* ── Webhook tarifi (OpenAPI 3.1 `webhooks`) ───────────────────────────── */

function webhooks(): Record<string, unknown> {
  const headers = {
    [SIGNATURE_HEADER]: 'v1=<hex> — HMAC-SHA256(secret, timestamp + "." + ham gövde)',
    [TIMESTAMP_HEADER]: 'Unix ms, GERÇEK saat. ±5 dk dışındakini reddedin.',
    [EVENT_HEADER]: 'Olay adı',
    [SEQUENCE_HEADER]: 'Kiracı içinde monoton sıra',
    [DELIVERY_HEADER]: 'Teslim kimliği (tekrarları ayıklamak için)',
  };
  const parameters = Object.entries(headers).map(([name, description]) => ({
    name,
    in: 'header',
    required: true,
    description,
    schema: { type: 'string' },
  }));
  const out: Record<string, unknown> = {};
  for (const event of WEBHOOK_EVENTS) {
    out[event] = {
      post: {
        tags: ['Webhook'],
        summary: `${event} olayı (sizin sunucunuza)`,
        description:
          'EN AZ BİR KEZ teslim edilir → tüketici idempotent olmalı. Sıra garanti DEĞİL → ' +
          '`documentVersion` ile eski olayı yok sayın. 2xx dışı yanıt yeniden denemeyi tetikler ' +
          `(${RETRY_DELAYS_MS.map((d) => `${d / 1000}s`).join(' → ')}, sonra ölü mektup).`,
        parameters,
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['event', 'documentId'],
                properties: {
                  event: { type: 'string', const: event },
                  documentId: str(),
                  documentVersion: nint(),
                  ettn: str(),
                  status: ref('DocStatus'),
                  previousStatus: nstr(),
                  rawGibCode: nint(),
                  alarm: nstr(),
                  transitionId: str(),
                  replyStatus: ref('ReplyStatus'),
                  senderVkn: nstr(),
                  receiverVkn: nstr(),
                },
              },
            },
          },
        },
        responses: { '2XX': { description: 'Alındı. Başka her yanıt yeniden denenir.' } },
      },
    };
  }
  return out;
}

/* ── Belge ─────────────────────────────────────────────────────────────── */

export const OPENAPI_TAGS = [
  { name: 'Sistem', description: 'Sağlık ve bağımlılıklar.' },
  { name: 'Şirketler', description: 'Mükellef tanımı. Kiracı anahtarı muhasebe yazılımını, `X-Company` müşterisini seçer.' },
  { name: 'Belgeler', description: 'Giden e-Fatura / e-Arşiv: gönder, izle, yeniden gönder.' },
  { name: 'Görüntü', description: 'HTML / PDF — canlı şablon servisinden.' },
  { name: 'Gelen kutusu', description: 'Gelen belgeler (İKİ ADIM: RECEIVED → S_APR → DELIVERED) ve ticari yanıt.' },
  { name: 'Webhook', description: 'Olay aboneliği, teslim günlüğü, elle yeniden gönderme.' },
  { name: 'Sandbox', description: '🔴 YALNIZ MOCK\'TA. Zaman, arıza, trafik, sıfırlama. Üretim kodunuzda bu uçlara bağımlılık kurmayın.' },
];

export function buildOpenApiDocument(serverUrl = 'http://localhost:8088'): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'MimMock API',
      version: '1',
      summary: 'MimForge e-Fatura altyapısının BUGÜNKÜ davranışının yerel simülatörü.',
      description: [
        'MimMock, bir muhasebe/ERP yazılımının e-Fatura entegrasyonunu **gerçek GİB\'e dokunmadan** ',
        'geliştirebilmesi için makinesinde çalışan bir sandbox\'tır. Gerçek UBL-TR üretir, canlı ',
        'şematrondan geçirir, test sertifikasıyla imzalar ve belgeyi MimForge\'dan ÖLÇÜLMÜŞ durum ',
        'makinesinde yürütür.\n\n',
        '**Bu yüzey geçicidir.** Üretim API\'si ayrı duyurulacak ve farklı olabilir; entegrasyonunuzla ',
        'bu API arasına ince bir adaptör katmanı koyun.\n\n',
        '### Kimlik\n',
        `\`Authorization: Bearer <kiracı anahtarı>\` + \`X-Company: <VKN>\`. Tohum anahtar: \`${SEED_TENANT_API_KEY}\` `,
        '(şirketler `1111111111` gönderici, `2222222222` alıcı).\n\n',
        '### LLM / yapay zekâ ajanları\n',
        'Bu API ile entegrasyon yazan bir model iseniz önce **`/llms-full.txt`** belgesini okuyun: durum ',
        'makinesi, geçiş tablosu, hata kataloğu, webhook doğrulama kodu ve sık yapılan hatalar oradadır.',
      ].join(''),
    },
    servers: [{ url: serverUrl, description: 'Yerel MimMock' }],
    externalDocs: { description: 'LLM için tam kılavuz', url: `${serverUrl}/llms-full.txt` },
    tags: OPENAPI_TAGS,
    security,
    paths: paths(),
    webhooks: webhooks(),
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: `Kiracı API anahtarı. Tohum: \`${SEED_TENANT_API_KEY}\`.`,
        },
      },
      schemas,
    },
  };
}
