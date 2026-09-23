# MimMock — LLM ve kodlama ajanları için tam kılavuz

> Bu belge, MimMock'u kendi uygulamasına entegre edecek bir yapay zekâ ajanının
> sistemi **baştan sona** anlaması için yazıldı. İnsan geliştirici için de
> geçerlidir. Tablolar (durumlar, geçişler, senaryolar, hata kodları, uçlar)
> sunucunun kendi kaynağından **üretilmiştir** — elle kopyalanmadı, eskimez.
>
> Makinece okunan sözleşme: `{{BASE}}/openapi.json` (OpenAPI 3.1).
> İnsan için etkileşimli referans: `{{BASE}}/docs`.

---

## 0. Önce şunu bil — 60 saniyelik özet

- **Ne:** MimForge adlı e-Fatura altyapısının **bugünkü** davranışının yerel
  simülatörü. Gerçek UBL-TR üretir, **canlı** XSD + şematrondan geçirir, test
  sertifikasıyla imzalar ve belgeyi MimForge'dan **ölçülmüş** bir durum
  makinesinde yürütür. Gerçek GİB'e hiçbir şey gitmez.
- **Ne değil:** Üretim API'sinin şartnamesi **değildir**. Yüzey geçicidir.
  Entegrasyonu MimMock'a doğrudan değil, **ince bir adaptör katmanına** yaz;
  üretime geçişte yalnız adaptör değişsin.
- **Asenkron:** Belge gönderimi `202` döner. Teslim saniyeler/dakikalar sonra
  gelir. Sonucu **webhook** ile al (ya da `GET /v1/documents/{id}` yokla).
  `202`'yi "gönderildi" diye yorumlama.
- **Kimlik:** `Authorization: Bearer <kiracı anahtarı>` + `X-Company: <VKN>`.
  Tohum anahtar `{{API_KEY}}`; tohum şirketler `1111111111` (gönderici) ve
  `2222222222` (alıcı).
- **Hata dallanması:** Daima `errorCode` alanına göre dallan. `reason` Türkçe
  insan metnidir ve değişebilir.
- **Zaman:** Sandbox'ın bir **sanal saati** var. 15 günlük bir bekleyişi bir
  saniyede atlatabilirsin (`POST /v1/_sandbox/clock`). Testlerini buna göre yaz.

---

## 1. Kolay yanlış kurulan beş şey

Bunlar gerçek entegrasyonlarda tekrar tekrar görülen hatalardır. Kodun bunlardan
birini varsayıyorsa yanlıştır.

1. **Teslim anı `1220`'dir, `1300` değil.** `1220` birincil teslim kodudur
   (belge alıcıya ulaştı, `deliveredAt` burada yazılır). `1300` zarf
   kapanışıdır ve 7–14 gün sonra gelebilir; yalnız `1220` hiç görülmediyse
   teslim sayılır. `1300`'ü bekleyen kod teslimi haftalarca geciktirir.
2. **Teslim geri alınabilir.** `DELIVERED` bir belgeye sonradan `1230` gelirse
   belge `SEND_FAILED` olur, `deliveredAt` **temizlenir** ve
   `DOCUMENT_DELIVERY_REVOKED` alarmı üretilir. `DELIVERED`'ı son durum sanma.
3. **Belge düzleminde `FAILED` diye bir durum YOKTUR.** Süre dolması (ör. GİB
   15 gün yanıt vermezse) belgeyi **askıda** bırakır ve bir alarm üretir
   (`POLL_DEADLINE`); belge hataya düşmez. Kodunda "zaman aşımı → FAILED"
   dalı kurma. Ayrıca şu değerler **hiç üretilmez**: `SENT`, `FAILED`,
   `SENT_TO_RECEIVER`, `RETURNED`.
4. **Gelen belge İKİ adımlıdır.** Önce `RECEIVED` (zarf alındı), sonra sistem
   yanıtı (S_APR) teyitlenince `DELIVERED`. Ticari yanıt (kabul/ret) ancak
   `DELIVERED`'dan sonra verilebilir; öncesinde `DOCUMENT_NOT_SETTLED` (409)
   alırsın. Yanıt vermeden önce gelen belgenin `replyable` alanını oku.
5. **`SEND_FAILED` terminal değildir — ama her hatadan aynı yoldan çıkılmaz.**
   `POST /v1/documents/{id}/resend` son ham GİB koduna bakar: **A** sınıfı
   yeniden gönderilir; **B** (`NEEDS_RESIGN`, 409) belgeyi düzeltip aynı ETTN
   ile yeniden POST etmeni ister — zarfı aynen tekrar göndermek aynı reddi
   üretir; **C** (`NOT_RESENDABLE_GIB`) asla/bekle demektir. Sınıf tablosu §7'de.
   Örneğin `1150` B sınıfıdır: "hata oldu, tekrar dene" döngüsü onu çözmez.

---

## 2. Çalıştırma

MimMock tek bir container'dır: tek port (`8088`), tek süreç.

```bash
docker run -d --name mimmock -p 8088:8088 \
  -e MIMMOCK_MIMKIT_URL=<mimkit adresi> -e MIMMOCK_MIMKIT_TOKEN=<anahtar> \
  --add-host host.docker.internal:host-gateway -v mimmock-data:/data \
  ghcr.io/mimarge/mimmock:latest
```

Kaynak: https://github.com/mimarge/mimmock

| Yol | İçerik |
|---|---|
| `{{BASE}}/` | Panel (durum tahtası) — insan için |
| `{{BASE}}/docs` | Etkileşimli API referansı (Scalar, OpenAPI 3.1) |
| `{{BASE}}/openapi.json` | Makinece okunan sözleşme — istemci üretimi için |
| `{{BASE}}/llms.txt` | Bu belgenin kısa dizini |
| `{{BASE}}/llms-full.txt` | Bu belge |
| `{{BASE}}/healthz` | Sağlık. mimkit hazır değilse `503 degraded` |

Kurulum, ortam değişkenleri ve günlük işletim: depodaki `README.md` →
"Kurulum" ve "İşletim" bölümleri.

**Tek bağımlılık: mimkit.** MimMock belgeyi kendisi doğrulamaz; XSD + şematron
doğrulaması, seri numaralama ve HTML/PDF görüntü **canlı** mimkit'ten gelir
(`MIMMOCK_MIMKIT_URL` + `MIMMOCK_MIMKIT_TOKEN`). mimkit'e ulaşamazsa ya da anahtar
reddedilirse container **kalkmaz** — sahte bir doğrulayıcıyla "geçti" demek,
üretimde reddedilecek belgeyi kabul ediyormuş gibi gösterirdi. mimkit anahtarı
için (adres ve anahtar) **bilgi@mimsoft.com.tr** adresine e-posta gönderin.
`MIMMOCK_ALLOW_OFFLINE=1` ile mimkit'siz kalkar; belge alma uçları
`503 OFFLINE_MODE` döner.

**Container ağından ana makineye:** Webhook adresin ana makinende çalışıyorsa
`localhost` değil `http://host.docker.internal:<port>/...` kullan (container
içinde `localhost` container'ın kendisidir).

---

## 3. Veri modeli

- **Kiracı (tenant):** Muhasebe/ERP yazılımının kendisi. API anahtarı kiracıya
  aittir.
- **Şirket (company):** O yazılımın müşterisi olan mükellef; VKN (10 hane) ya
  da TCKN (11 hane) ile tanımlanır. Her istekte `X-Company` ile seçilir.
  Mock'ta "e-Fatura sicili" = bu kiracıda tanımlı ve `eInvoiceRegistered: true`
  şirketlerdir.
- **Belge (document):** `id` (`doc_…`, mock kimliği — uçlar bunu alır) ve
  `ettn` (UUID, GİB tekil numarası) taşır. ETTN **yön ile birlikte** tekildir:
  A'dan B'ye giden bir fatura, A'nın GİDEN ve B'nin GELEN listesinde aynı
  ETTN ile durur.
- **İki eksen:** `status` belgenin iletim durumudur; `replyStatus` ticari yanıt
  eksenidir. Birbirinden bağımsız yürürler.

### Belge durumları

{{STATUSES}}

### Yanıt durumları (`replyStatus`)

{{REPLY_STATUSES}}

---

## 4. Durum makinesi

Geçişler kodda değil, **veri** olarak durur (`server/src/engine/transitions.ts`)
ve her satır MimForge'daki ölçüldüğü `dosya:satır`'a atıf yapar. Olay geçmişinde
(`GET /v1/documents/{id}/history`) gördüğün `ruleId` bu tablonun kimliğidir.

{{TRANSITIONS}}

Yazımlar karşılaştır-ve-yaz (CAS) kilidiyle yapılır: "durum hâlâ okuduğum
durumsa yaz". Geç gelen bir kod `DELIVERED`'ı ezemez; eşleşmeyen olay sessizce
hiçbir şey yapmaz (MimForge da öyle davranır).

### Tipik akışlar

```
GİDEN (happy)
  202 kabul → AWAITING_SIGNATURE ──sign──▶ PROCESSING ──submit──▶ SENT_TO_GIB
            ──1200──▶ (ara eşik, durum aynı)
            ──1220──▶ DELIVERED  ◀── teslim anı, deliveredAt yazılır
            ──1300──▶ (zarf kapandı, durum DELIVERED kalır, rawGibCode=1300)

GİDEN (receiver_reject)
  … ──1220──▶ DELIVERED ──1230──▶ SEND_FAILED   (teslim GERİ ALINDI, alarm)

GİDEN (gib_stalled)
  … ──1210──▶ SENT_TO_GIB … 15 gün … POLL_DEADLINE alarmı → AÇIK kalır (hata değil)

GELEN
  RECEIVED ──S_APR gönderildi──▶ RECEIVED ──S_APR teyit (1200|1300)──▶ DELIVERED
  (ancak şimdi) ticari yanıt: AWAITING ──reply──▶ REPLY_IN_PROGRESS ──1300──▶ ACCEPTED|REJECTED
```

---

## 5. Senaryolar

Her belge bir senaryoyla yürür. Giden belgede `X-Scenario` başlığıyla (ya da
JSON gövdesinde `scenario`) seçilir; verilmezse `happy`. Gelen ve yanıt
senaryolarını motor otomatik bağlar. Gecikmeler **sanal** saatle işler ve
birikimlidir: bir adımın vadesi, önceki adımın vadesinin üstüne eklenir — saati
ileri atlatınca vadesi gelen bütün adımlar sırayla ateşlenir.

{{SCENARIOS}}

---

## 6. Webhook

Olaylar: {{WEBHOOK_EVENTS}}.

- **Teslim EN AZ BİR KEZ:** aynı olay birden fazla gelebilir. Tüketici
  idempotent olmalı — `X-MimMock-Delivery` kimliğiyle tekrarları ayıkla.
- **Sıra garanti DEĞİL:** aynı belge için gelen olaylarda `documentVersion`
  küçük olanı yok say. `sequence` kiracı içinde monotondur.
- **Yeniden deneme:** 2xx dışı her yanıt ya da zaman aşımı yeniden denenir:
  {{RETRY}}, ardından **ölü mektup**. Ölü mektup elle yeniden gönderilebilir
  (`POST /v1/webhooks/{id}/replay`).
- **İmza:** `X-MimMock-Signature: v1=<hex>`, burada
  `hex = HMAC-SHA256(secret, X-MimMock-Timestamp + "." + ham_gövde)`.
  Damga Unix milisaniye ve **gerçek** saattir (sanal saat ileri atlasa bile);
  ±5 dakika dışını reddet. **Ham gövdeyi** imzala — JSON'u ayrıştırıp yeniden
  serileştirirsen imza tutmaz. Karşılaştırmayı sabit zamanlı yap.

```js
// Node — Express örneği. Gövde HAM okunmalı: express.raw({ type: 'application/json' })
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyMimMock(req, secret, toleranceMs = 5 * 60 * 1000) {
  const signature = req.get('x-mimmock-signature') ?? '';
  const timestamp = req.get('x-mimmock-timestamp') ?? '';
  const body = req.body.toString('utf8'); // Buffer, ham
  if (Math.abs(Date.now() - Number(timestamp)) > toleranceMs) return false;
  const expected = 'v1=' + createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  const a = Buffer.from(signature), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

```python
# Python
import hmac, hashlib, time

def verify_mimmock(headers, raw_body: bytes, secret: str, tolerance_ms=5 * 60 * 1000) -> bool:
    ts = headers.get("x-mimmock-timestamp", "")
    sig = headers.get("x-mimmock-signature", "")
    if abs(time.time() * 1000 - int(ts or 0)) > tolerance_ms:
        return False
    mac = hmac.new(secret.encode(), f"{ts}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, "v1=" + mac)
```

Bağımsız doğrulayıcı betik (hiçbir mock kodu import etmez):
`scripts/verify-webhook-signature.mjs`.

Kendi sunucunu kurmadan denemek için: mock'un **tohum alıcısı** kendi
webhook'unu yutar ve imzayı gerçekten doğrular —
`GET /v1/_sandbox/webhook-sink`.

---

## 7. Hata sözleşmesi

Gövde her zaman:

```json
{ "errorCode": "DOCUMENT_NOT_SETTLED", "reason": "Türkçe açıklama", "errors": [{ "field": "…", "reason": "…" }] }
```

`errors` yalnız alan düzeyinde hatalarda vardır. `source` sütunu kodun
MimForge'da ölçüldüğü yeri gösterir; `mimmock` = mock'a özgü.

{{ERRORS}}

### Yeniden gönderme sınıfları (`POST /v1/documents/{id}/resend`)

Son ham GİB koduna göre. Tabloda olmayan kod **A gibi** davranır (bilinçli
fail-open, MimForge'dan ölçüldü).

{{RESEND}}

---

## 8. Entegrasyon tarifi (ajan için adım adım)

1. **Adaptör katmanı kur.** Uygulamanın iç modeli (fatura, müşteri) ile MimMock
   arasına tek bir modül koy: `sendInvoice`, `getStatus`, `handleWebhook`,
   `replyToInvoice`. Üretime geçişte yalnız bu modül değişir.
2. **Şirketleri tanımla.** Uygulamandaki her mükellef için
   `POST /v1/companies`. Alıcı da tanımlıysa teslim edilen fatura onun gelen
   kutusuna düşer — iki taraflı akışı tek makinede sınayabilirsin.
3. **Gönder.** `POST /v1/documents` (JSON) ya da `POST /v1/documents/ubl`
   (hazır UBL). JSON yolunda `id` (belge numarası) ve `uuid` (ETTN) **zorunludur**;
   her yeni belge için yeni bir UUID üret. Numaranın yılı `datetime` ile tutmalı,
   tarih gelecekte olamaz. Yanıttaki `id`'yi (`doc_…`) sakla — diğer uçlar onu alır.
4. **Durumu webhook'la izle.** `POST /v1/webhooks` ile kaydol; imzayı doğrula;
   `documentVersion` ile eskiyi ele; `deliveredAt` yalnız `1220`'de dolar.
5. **Hataları `errorCode` ile eşle.** 4xx: girdi hatası, düzelt. `409`: durum
   kapısı (ör. zaten teslim edildi) — yeniden deneme değil, akış kararı.
   `503`: mimkit geçici olarak yanıt vermiyor (doğrulama/numaralama/görüntü) — yeniden dene.
6. **Gelen kutusunu işle.** `inbox.received` webhook'u `RECEIVED` ile gelir;
   `DELIVERED` olmadan yanıt verme. `replyable.can` doğruysa
   `POST /v1/inbox/{id}/reply`.
7. **Kenar durumlarını test et** (aşağıdaki sandbox tarifleriyle).

### Test tarifleri — sandbox uçlarıyla

| Sınamak istediğin | Nasıl |
|---|---|
| Normal teslim | `X-Scenario: happy`, sonra `POST /v1/_sandbox/clock {"advanceMs": 60000}` |
| Teslimin geri alınması (1230) | `X-Scenario: receiver_reject` ya da `DELIVERED` belgeye `POST /v1/_sandbox/documents/{id}/fail {"rawGibCode": 1230}` |
| Düzeltilmesi gereken GİB hatası (B sınıfı) | `X-Scenario: gib_error` → `SEND_FAILED` (1150) → `POST /v1/documents/{id}/resend` → **409 `NEEDS_RESIGN`**: belgeyi düzelt, aynı ETTN ile yeniden POST et |
| Yeniden gönderilebilir hata (A sınıfı) | `X-Scenario: receiver_reject` → `SEND_FAILED` (1230) → `resend` → **200**, belge `PROCESSING`'e döner |
| 15 gün yanıtsızlık | `X-Scenario: gib_stalled`, sonra `POST /v1/_sandbox/clock {"advanceDays": 16}` → belge AÇIK kalır |
| Gelen belge + yanıt kapısı | `POST /v1/_sandbox/inbox` (ham XML, `X-Company: 2222222222`) → hemen yanıt dene → `DOCUMENT_NOT_SETTLED` |
| Teyidi hiç gelmeyen gelen belge | aynı uç, `X-Scenario: inbound_sr_stalled` |
| Tek adım ilerletme | `POST /v1/_sandbox/documents/{id}/advance` |
| Temiz başlangıç | `POST /v1/_sandbox/reset` (🔴 tüm veriyi siler) |

🔴 `/v1/_sandbox/*` uçları **yalnız mock'ta** vardır ve her yanıt
`X-MimMock-Sandbox: 1` başlığı taşır. Üretim kodunda bu uçlara bağımlılık kurma;
yalnız test kodunda kullan.

### Hata ayıklarken

- `GET /v1/_sandbox/requests` — gönderdiğin ham istek ve dönen ham yanıt
  (gizli başlıklar maskeli). "Anahtarım neden çalışmıyor" sorusunun cevabı
  burada: kimliği çözülemeyen istekler de kaydedilir.
- `GET /v1/documents/{id}/history` — belgenin her geçişi, kural kimliğiyle.
- `GET /v1/webhooks/{id}/deliveries` — her teslim denemesi, HTTP kodu, hata.

---

## 9. İmza ve sertifika

Belgeler XAdES ile imzalanır ama sertifika **kendinden imzalı test
sertifikasıdır**. İmza yapısı gerçektir (ayrıştırıcın çalışır), **zincir
doğrulaması kasten başarısız olur** — gerçek mali mühür bir geliştirici
makinesine konulmaz. `GET /v1/documents/{id}/xml` yanıtı
`X-MimMock-Document-Signature: test-certificate; self-signed;
chain-validation-fails-by-design` başlığı taşır; belge gövdesinde
`signature.chainValid` her zaman `false`'tur. Bunu bir hata sanma.

---

## 10. Başlık özeti

| Başlık | Yön | Anlam |
|---|---|---|
| `Authorization: Bearer <anahtar>` | istek | Kiracı kimliği |
| `X-Company: <VKN>` | istek | İşlemin mükellefi |
| `X-Scenario: <ad>` | istek | Belgenin senaryosu |
| `X-Series-Prefix: <önek>` | istek | UBL yolunda numarasız belge için seri |
| `X-Panel-Token` / `X-Tenant` | istek | Yalnız panel/yönetim için |
| `X-MimMock-Api: 1` | yanıt | Her yanıtta — bu MimMock API v1'dir, MimForge değil |
| `X-MimMock-Sandbox: 1` | yanıt | `/v1/_sandbox/*` yanıtlarında |
| `X-MimMock-Document-Signature` | yanıt | `/xml`: imzanın test sertifikası olduğu |
| `X-MimMock-Template` | yanıt | `/html`: hangi şablonun çizdiği |
| `Link` | yanıt | `rel="service-desc"` → OpenAPI, `rel="describedby"` → bu belge |

---

## 11. Uç listesi

Tam şema, örnek gövde ve yanıtlar için `{{BASE}}/openapi.json`.

{{ENDPOINTS}}
