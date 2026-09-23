# MimMock

**MimForge'un bugün yaptığı işin simülatörü.** Bir muhasebe/ERP yazılımının
e-Fatura entegrasyonunu gerçek GİB'e dokunmadan geliştirebilmesi için kendi
makinenizde çalışan bir sandbox: gerçek UBL-TR üretir, **canlı** şematrondan
geçirir, test sertifikasıyla imzalar, belgeyi MimForge'dan ölçülmüş durum
makinesinde yürütür ve webhook atar.

```bash
docker run -d --name mimmock -p 8088:8088 \
  -e MIMMOCK_MIMKIT_URL=<mimkit adresi> -e MIMMOCK_MIMKIT_TOKEN=<anahtar> \
  --add-host host.docker.internal:host-gateway -v mimmock-data:/data \
  ghcr.io/mimarge/mimmock:latest
# → http://localhost:8088   (panel · /docs · /llms-full.txt)
```

mimkit adresi ve anahtarı için **[bilgi@mimsoft.com.tr](mailto:bilgi@mimsoft.com.tr)**
adresine e-posta gönderin. Kalıcı kurulum ve işletim yardımcısı için depoyu klonlayın:
`git clone https://github.com/mimarge/mimmock && cd mimmock && ./scripts/mimmock up`.

> **🤖 Bir LLM ya da kodlama ajanıysanız** — bu README'yi değil, şunları okuyun:
> [`llms-full.txt`](./llms-full.txt) (tam kılavuz: durum makinesi, geçiş tablosu,
> webhook doğrulama kodu, hata kataloğu, entegrasyon ve test tarifleri) ve
> [`docs/openapi.json`](./docs/openapi.json) (OpenAPI 3.1). Çalışan bir
> container'da aynıları `/llms-full.txt` ve `/openapi.json` adreslerindedir.
> Bu depoda kod yazacaksanız: [`AGENTS.md`](./AGENTS.md).

## Belgeler

| Kimin için | Nerede | Ne var |
|---|---|---|
| Geliştirici | `http://localhost:8088/docs` | **Etkileşimli API referansı** (Scalar) — her uç, şema, örnek gövde, "Try it" |
| Geliştirici | `http://localhost:8088` | Panel — belgeler, olay ekseni, webhook teslimleri, ham istek günlüğü |
| Araçlar | `/openapi.json` · [`docs/openapi.json`](./docs/openapi.json) | OpenAPI 3.1 — istemci ve tip üretimi |
| LLM / ajan | `/llms.txt` · `/llms-full.txt` · [`llms-full.txt`](./llms-full.txt) | Makinenin baştan sona okuyacağı kılavuz ([llmstxt.org](https://llmstxt.org) biçimi) |
| Bu depoda çalışan ajan | [`AGENTS.md`](./AGENTS.md) | Depo kuralları, komutlar |
| İşletim | bu README → [Kurulum](#kurulum) · [İşletim](#işletim) · [Sorun giderme](#sorun-giderme) | Container, yapılandırma, yedek |

Depodaki `llms*.txt` ve `docs/openapi.json` **üretilmiş** dosyalardır; kaynakları
sunucunun kendi sabitleridir ve CI tazeliklerini ölçer (`docs:check`). Belge ile
sunucunun ayrışmadığını testler ölçer: sunucudaki her uç belgede, belgedeki her
uç sunucuda, ve gerçek yanıtlar belgedeki şemaya uyuyor.

---

## Kurulum

### Gerekenler

| | |
|---|---|
| **Docker** (compose v2 ile) | Docker Desktop (macOS/Windows) ya da Docker Engine (Linux) |
| **mimkit anahtarı** — tek dış bağımlılık | Adres + anahtar (`MIMMOCK_MIMKIT_URL`, `MIMMOCK_MIMKIT_TOKEN`). mimkit sunucuda sürekli canlıdır; yerelde kuracağınız başka bir servis yoktur |

🔑 **mimkit adresi ve anahtarı için [bilgi@mimsoft.com.tr](mailto:bilgi@mimsoft.com.tr) adresine e-posta gönderin.**

🔴 **MimMock belgeyi kendisi doğrulamaz.** XSD + şematron doğrulaması, seri
numaralama ve HTML/PDF görüntü **canlı mimkit**'ten gelir — MimForge'un kullandığı
yolun aynısı. mimkit'e ulaşamazsa ya da anahtar reddedilirse MimMock **kalkmaz**
ve sebebini yazar ("anahtar reddedildi" ile "erişilemedi" ayrı söylenir). Sahte bir
doğrulayıcıyla "geçti" demek, üretimde reddedilecek belgeyi kabul ediyormuş gibi
gösterirdi.

Anahtarınız henüz gelmediyse MimMock'u [çevrimdışı kipte](#çevrimdışı-kip)
kaldırabilirsiniz: panel ve yönetim çalışır, belge gönderme çalışmaz.

### Hızlı başlangıç — yardımcıyla (önerilen)

```bash
./scripts/mimmock init      # .env'i oluşturur, mimkit adresini ve anahtarını sorar
./scripts/mimmock up        # denetler → imajı çeker → başlatır → hazır olunca adresleri yazar
./scripts/mimmock up --build   # imajı yayımlanmış sürümden değil, kaynaktan derle
```

`up` şunları kendisi yapar: Docker ve compose var mı, port boş mu, mimkit adresi
ve anahtarı verilmiş mi, mimkit'e **anahtarla birlikte** erişilebiliyor mu (sunucu
açılışıyla aynı sonda — anahtar reddedilirse ayrı söyler) — sonra yayımlanmış imajı
çeker (`ghcr.io/mimarge/mimmock`), container'ı başlatır, `/healthz`
hazır olana kadar bekler ve şunu yazar:

```
✓ MimMock hazır

  Panel            http://localhost:8088
  API referansı    http://localhost:8088/docs
  OpenAPI          http://localhost:8088/openapi.json
  LLM kılavuzu     http://localhost:8088/llms-full.txt

  Kimlik           Authorization: Bearer mimmock_dev_key
                   X-Company: 1111111111   (gönderici)  ·  2222222222 (alıcı)
```

Ölçüldü: kaynaktan derlemede, katman önbelleği varken `up`'tan "hazır"a ~35 saniye.

### Yardımcı olmadan — düz compose

```bash
cp .env.example .env         # MIMMOCK_MIMKIT_URL ve MIMMOCK_MIMKIT_TOKEN'ı doldurun
docker compose pull && docker compose up -d      # yayımlanmış imaj
# docker compose up -d --build                   # ya da kaynaktan
curl -s http://localhost:8088/healthz
```

Windows'ta (PowerShell) yardımcı betik yerine bu yolu kullanın; komutlar aynıdır.

### Container ağından ana makineye: `localhost` tuzağı

Container içinde `localhost` **container'ın kendisidir**. MimMock'a kaydettiğiniz
webhook alıcısı ana makinenizde çalışıyorsa adresinde `host.docker.internal`
kullanın:

```bash
curl -X POST http://localhost:8088/v1/webhooks -H 'authorization: Bearer mimmock_dev_key' \
  -H 'content-type: application/json' \
  -d '{"url":"http://host.docker.internal:3000/webhooks/mimmock"}'     # ✓
# "url":"http://localhost:3000/…"                                        ✗ container kendine gönderir
```
Linux'ta bu ad kendiliğinden yoktur; `docker-compose.yml` onu `extra_hosts` ile
tanımlar.

### Dış PostgreSQL (ekip ortak sandbox'ı)

```bash
./scripts/mimmock up --pg
# ya da: docker compose -f docker-compose.yml -f docker-compose.pg.yml up -d --build
```

Aynı şema, aynı davranış; `/healthz` → `"dialect": "pg"`. Kendi PostgreSQL'iniz
için `.env`'de `MIMMOCK_DB=postgres://…` verin.

### Çevrimdışı kip

mimkit anahtarınız henüz yoksa ya da yalnız paneli/API yüzeyini incelemek
istiyorsanız:

```bash
./scripts/mimmock up --offline      # .env'e MIMMOCK_ALLOW_OFFLINE=1 yazar (kalıcı)
```

Ölçülen davranış:

| Çalışır | Çalışmaz |
|---|---|
| Panel, `/docs`, `/openapi.json`, `/llms*.txt` | `POST /v1/documents`, `/v1/documents/ubl` → `503 OFFLINE_MODE` |
| Şirketler, webhook kaydı, senaryolar, sanal saat | Trafik üreteci |
| Gelen kutusuna ham XML enjeksiyonu (`/v1/_sandbox/inbox`) | HTML/PDF görüntü (mimkit yoksa) |
| Mevcut belgelerin okunması | — |

`/healthz` `503 "degraded"` döner; bu yüzden Docker container'ı **unhealthy**
gösterir — bu kipte beklenen budur.

### İmaj ve sürümler

`ghcr.io/mimarge/mimmock` — public, `linux/amd64` ve `linux/arm64` (Apple Silicon).

| Etiket | Anlamı |
|---|---|
| `latest` | Son sürüm |
| `0.1.0` · `0.1` | Sabit sürüm — ekip ortak sandbox'ında bunu kullanın |

Compose'da sürüm sabitlemek için `.env`'de `MIMMOCK_VERSION=0.1.0`. Yeni sürüm,
depoda `v*` etiketi atılınca `.github/workflows/release.yml` ile yayımlanır.

---

## İşletim

API dışındaki bütün işler. Her satırın düz compose karşılığı da var.

| İş | Yardımcı | Düz komut |
|---|---|---|
| Durum ve sağlık | `./scripts/mimmock status` | `docker compose ps` · `curl localhost:8088/healthz` |
| Adresler + kimlik | `./scripts/mimmock info` | — |
| Günlük | `./scripts/mimmock logs -f` | `docker compose logs -f mimmock` |
| Paneli / belgeleri aç | `./scripts/mimmock open [panel\|docs\|llms]` | tarayıcıda `localhost:8088` |
| Durdur (veri kalır) | `./scripts/mimmock down` | `docker compose down` |
| Yeniden başlat | `./scripts/mimmock restart` | `docker compose restart mimmock` |
| **Bütün veriyi sıfırla** | `./scripts/mimmock reset` | `curl -X POST localhost:8088/v1/_sandbox/reset -H 'authorization: Bearer mimmock_dev_key'` |
| Yedek al | `./scripts/mimmock backup [dosya]` | aşağıda |
| Yedekten dön | `./scripts/mimmock restore <dosya>` | aşağıda |
| Güncelle | `./scripts/mimmock update` | `docker compose pull && docker compose up -d` |
| Tamamen kaldır | `./scripts/mimmock destroy` | `docker compose down -v` |

Onay isteyen komutlar (`reset`, `restore`, `destroy`) etkileşimsiz ortamda
`MIMMOCK_YES=1` ister.

**Yedek.** SQLite'ta yedek, çalışan veritabanının **tutarlı** kopyasıdır (SQLite
yedekleme API'si; WAL güvenli) ve tek bir `.db` dosyasıdır. PostgreSQL'de
`pg_dump` çıktısı (`.sql`). Ölçüldü: yedek → sıfırla → geri yükle gidiş-dönüşünde
belge sayısı korundu.

**Veri nerede.** `mimmock-data` Docker biriminde (`/data/mimmock.db`).
`down` veriyi silmez; `destroy` siler.

**Sanal saat.** Panelde ya da `POST /v1/_sandbox/clock` ile ileri atlatılır;
`reset` onu da sıfırlar. Webhook imza damgaları her zaman gerçek saattedir.

**Panel kapısı.** Ortak bir makinede `.env`'de `MIMMOCK_PANEL_TOKEN` verin;
panel ilk açılışta token'ı sorar (Operasyon çekmecesi).

**Port değiştirme.** `.env`'de `MIMMOCK_HOST_PORT=9090` → `http://localhost:9090`.
Container içinde her zaman 8088 dinlenir.

**Şema değişince.** Mock migration taşımaz: yeni sürüm şemayı değiştirdiyse açılış
net bir hatayla durur. Veriyi atıp yeniden kurmak için `.env`'de
`MIMMOCK_DB_AUTO_RESET=1` verin ya da `./scripts/mimmock reset`.

---

## Sorun giderme

| Belirti | Sebep | Çözüm |
|---|---|---|
| Container hemen çıkıyor; günlükte *"mimkit hazır değil"* | `MIMMOCK_MIMKIT_URL` / `_TOKEN` boş ya da yanlış | `./scripts/mimmock doctor` — sebebi söyler; ya da `--offline` |
| Günlükte *"mimkit anahtarı reddedildi (401)"* | Anahtar yanlış ya da süresi dolmuş | Yeni anahtar: bilgi@mimsoft.com.tr |
| Container durmadan yeniden başlıyor (`docker ps` → *Restarting*) | mimkit hazır değil; compose `restart: unless-stopped` açılışı yeniden dener | Bilinçli: mimkit geri gelince kendiliğinden toparlanır. Sebep: `./scripts/mimmock logs` ya da `doctor` |
| `doctor`: *"Adres 'localhost'"* | Container içinde localhost kendisidir | `host.docker.internal` kullanın ([ayrıntı](#container-ağından-ana-makineye-localhost-tuzağı)) |
| `/healthz` → `503 degraded` | mimkit hazır değil ya da çevrimdışı kip | Çevrimdışı kip bilinçliyse beklenen davranış |
| `Port 8088 kullanımda` | Başka bir süreç | `.env`'de `MIMMOCK_HOST_PORT` |
| Webhook'larım gelmiyor | Adres `localhost` / alıcı 2xx dönmüyor | Adres `host.docker.internal`; panelde teslim günlüğüne bakın (HTTP kodu ve hata orada) |
| `401 MISSING_API_KEY` | `Authorization` yok ya da `Bearer` biçiminde değil | `Authorization: Bearer mimmock_dev_key` |
| `400 BRANCH_REQUIRED` / `404 CONTEXT` | `X-Company` yok / o VKN tanımlı değil | `X-Company: 1111111111` ya da önce `POST /v1/companies` |
| `400 JSON_BUILD_FAILED` | JSON'da `id` ya da `uuid` yok, tarih gelecekte, yıl numarayla uyuşmuyor | `reason` ve `errors[]` alan alan söyler; `/docs`'taki örnek gövde çalışır |
| `409 DUPLICATE_UUID` | Aynı ETTN ikinci kez | Her yeni belgeye yeni UUID |
| `409 NEEDS_RESIGN` (resend'de) | Son GİB kodu B sınıfı | Belgeyi düzeltip aynı ETTN ile yeniden POST edin |
| `409 DOCUMENT_NOT_SETTLED` (yanıtta) | Gelen belge henüz `DELIVERED` değil (iki adımlı akış) | Teyidi bekleyin ya da saati ilerletin |
| HTML/PDF `503 TEMPLATE_UNAVAILABLE` | mimkit ayarlı değil (çevrimdışı kip) | `MIMMOCK_MIMKIT_URL` / `_TOKEN` |
| Bir isteğin neden reddedildiğini göremiyorum | — | Panel → Ham istek günlüğü ya da `GET /v1/_sandbox/requests`: gönderdiğiniz ve dönen **ham** gövde |

---

## 🔴 İmzalar TEST sertifikasıyladır

Mock, gömülü bir **test sertifikasıyla** yapısal olarak geçerli XAdES üretir:
ayrıştırıcınız çalışır, imza yapısı ve algoritması gerçektir — ama sertifika
kendinden imzalıdır ve **zincir doğrulaması KASTEN başarısız olur.**

Bu bir arıza değildir: gerçek ÖE mali mührü bir geliştiricinin makinesine konulmaz.
`GET /v1/documents/:id/xml` yanıtı bunu başlıkta söyler:

```
X-MimMock-Signature: test-certificate; self-signed; chain-validation-fails-by-design
```

## 🔴 Bu yüzey geçicidir

MimMock, yarın kurulacak gerçek geliştirici platformunun **şartnamesi değildir**,
ön koşulu değildir ve o platformun geçmek zorunda olduğu bir uygunluk takımı
üretmez. Üretim yüzeyi **ayrı duyurulacak** ve farklı olabilir.

Entegrasyonunuzla bu API arasına bir **adaptör katmanı** koymanız önerilir. Bu bir
nezaket değil maliyet kararıdır: bu yüzeye derin bağlanan kod, üretim yüzeyi
geldiğinde baştan yazılır.

API kendi adıyla sürümlenir: **`mimmock` API v1**. Her yanıt `X-MimMock-Api: 1`
başlığı taşır.

## Ne taklit, ne gerçek

| Katman | Sadakat |
|---|---|
| GİB'in kendisi | **taklit** — gerçek gönderim yok, olamaz |
| UBL doğrulama | **gerçek** — canlı mimkit: XSD + Schematron ✅ |
| Numaralandırma | **gerçek** — canlı mimkit numaratörü ✅ |
| Şablon / görüntü | **gerçek** — canlı mimkit şablonu ✅ |

Üç "gerçek" satırı da **aynı** servisten gelir: mimkit, MimMock'un tek dış bağımlılığı.
| Durum sözlüğü | gerçek — MimForge'dan **ölçülmüş**, uydurulmamış |
| Hata taksonomisi | gerçek — aynı şekilde ölçülmüş |
| İmza | **yapısal** — test sertifikası; zincir doğrulaması KASTEN başarısız ✅ |

## Senaryolar ve zaman kumandası

Belge gönderirken `X-Scenario` başlığıyla (ya da JSON gövdesinde `scenario`) akışı seçin:

| Senaryo | Ne yapar |
|---|---|
| `happy` | imza → gönderim → `1200` → **`1220` teslim** → `1300` zarf kapanışı |
| `receiver_reject` | teslimden sonra **`1230`**: teslim GERİ ALINIR, `deliveredAt` NULL'a düşer |
| `gib_stalled` | belge **asılı kalır** + 15 günde `POLL_DEADLINE` alarmı — kapanmaz |
| `gib_error` | `1150` → `SEND_FAILED` (terminal değil, resend açık) |
| `slow` | `happy` ×10 |

```bash
# 15 günü bir saniyede atla — sadakat bozulmadan bekleme kalkar
curl -X POST localhost:8088/v1/_sandbox/clock -H "Authorization: Bearer <key>" \
     -H 'content-type: application/json' -d '{"advanceDays":16}'

# tek adım ilerlet / arıza enjekte / sıfırla
curl -X POST localhost:8088/v1/_sandbox/documents/<id>/advance -H "Authorization: Bearer <key>"
curl -X POST localhost:8088/v1/_sandbox/documents/<id>/fail -H "Authorization: Bearer <key>" \
     -H 'content-type: application/json' -d '{"rawGibCode":1230}'
curl -X POST localhost:8088/v1/_sandbox/reset -H "Authorization: Bearer <key>"
```

`_sandbox` ad alanı bilerek ayrıdır (plan K11): kumanda otomatik test için gerekli,
ama kimse canlıda bu uçlara kod yazmasın.

## Trafik üreteci

`docker run` der demez sandbox **canlı hissettirir**: mock kendi kendine belge
üretip tanımlı şirketlerin gelen kutusuna gönderir.

```
MIMMOCK_TRAFFIC_ENABLED=1        # varsayılan açık
MIMMOCK_TRAFFIC_SEED=mimmock     # aynı tohum → aynı trafik
MIMMOCK_TRAFFIC_INTERVAL_MS=120000
MIMMOCK_TRAFFIC_BURST=1
```

🔴 **Üretilen her belge GERÇEK UBL'dir** ve canlı şematrondan geçer; geçmeyen
belge gelen kutusuna **yazılmaz** ve sebebi günlüğe düşer. Sahte gövde size
hiçbir şey öğretmez.

🔑 Üretilmiş trafik her yerde **işaretlidir** (`generated: true`, panelde rozet,
webhook gövdesinde alan) — kendi trafiğinizle karıştırmazsınız. Göndericiler
mock'ta şirket olarak **tanımlı değildir**; dışarıdan gelmiş gibi görünürler.

Elle tetiklemek için: `POST /v1/_sandbox/traffic`.

## Görüntü

```bash
GET /v1/documents/:id/html    # text/html  + X-MimMock-Template: <id>@<sürüm>
GET /v1/documents/:id/pdf     # application/pdf
GET /v1/templates             # şirket tanımında seçilebilecek şablonlar
```

Mock şablon dönüşümünü kendisi uygulamaz; **canlı mimkit'e çizdirir** (plan §1). Görüntü,
müşterinize gösterdiğiniz tek şeydir — sahte bir PDF hiçbir şey öğretmez.

Görüntü servisi yapılandırılmamışsa mock ayakta kalır ve belge almaya devam eder;
yalnız görüntü uçları `503 TEMPLATE_UNAVAILABLE` der.

## Gelen kutusu

🔑 **Gelen belge İKİ ADIMLIDIR.** `RECEIVED` = zarf alındı; `DELIVERED` = verdiğimiz
sistem yanıtı (S_APR) GİB'de teyitlendi. Belge `DELIVERED` olmadan ticari yanıt
verilemez — `409 DOCUMENT_NOT_SETTLED`. Tek adımlı bir sandbox size bu kapıyı hiç
göstermez ve üretimde ilk kez orada çarparsınız.

```bash
GET  /v1/inbox                 # X-Company ile mükellef süzülür
GET  /v1/inbox/:id             # `replyable: {can, reason}` kapıyı önceden söyler
POST /v1/inbox/:id/reply       # {"decision":"ACCEPTED"|"REJECTED","reason":"…"}

# ham XML enjeksiyonu (otomatik test için)
curl -X POST localhost:8088/v1/_sandbox/inbox -H "X-Company: 2222222222" \
     -H 'content-type: application/xml' -H 'X-Scenario: inbound_sr_stalled' \
     --data-binary @fatura.xml
```

**A→B tam döngü:** tanımlı bir şirkete kestiğiniz fatura GİB'de teslim olunca
(`1220`) alıcının gelen kutusuna düşer ve kendi iki adımlı akışını yürütür. Tek
geliştirici iki tarafı da sınar. Alıcı tanımlı değilse belge zaten e-Arşiv yoluna
aittir (`RECEIVER_NOT_REGISTERED`).

## Webhook

Kayıt: `POST /v1/webhooks` · günlük: `GET /v1/webhooks/:id/deliveries` ·
elle gönderme: `POST /v1/webhooks/:id/replay`.

```
imza          HMAC-SHA256(secret, timestamp + "." + body)  → v1=<64 hex>
başlıklar     X-MimMock-Signature · X-MimMock-Timestamp · X-MimMock-Event
              X-MimMock-Sequence · X-MimMock-Delivery
tekrar penc.  ±5 dk
teslim        EN AZ BİR KEZ → tüketiciniz idempotent olmalı
sıralama      GARANTİ EDİLMEZ → sequence + documentVersion alanlarına bakın
yeniden dene  2s → 5s → 15s → 60s → 300s, sonra ölü mektup
```

İmzayı doğrulamak için hazır, bağımsız bir örnek:
`scripts/verify-webhook-signature.mjs` (yalnız `node:crypto` kullanır, kopyalayın).

🔑 `docker run` der demez **çalışan bir alıcı** hazırdır: tohum webhook mock'un kendi
`/v1/_sandbox/webhook-sink` ucuna bakar, imzayı gerçekten doğrular ve sonucu panelde
gösterir. Boş bir teslim günlüğü hiçbir şey öğretmez.

⚠️ İmza zaman damgası **gerçek zamandır**; `_sandbox/clock` ile sanal saati ileri
atmak onu kaydırmaz. Aksi hâlde dış alıcılarınız teslimleri "stale" diye reddederdi.

## Panel

`http://localhost:8088` bir **durum tahtasıdır** — uçuş bilgi tahtası gibi
okunur ve üç soruyu sırayla cevaplar.

| Soru | Tahtadaki yeri |
|---|---|
| **ne oldu?** | satırın DURUM ve HAM sütunları |
| **neden oldu?** | satıra basın — **satır açılır**, altına tek dikey zaman ekseni iner: her olay kendi anına çakılı, kural kimliği (G5…G16, L10, L11), ham GİB kodu, alarm ve kuralın MimForge'daki `dosya:satır` atfı ile |
| **şimdi ne olacak?** | SIRADA sütunu, ve rayın altındaki zaman şeridi |

Tahtanın ayırt edici üç parçası:

- **İki saat yan yana** — GERÇEK ve SANAL, tarihleriyle. Sapma varken sanal saat
  kehribar bir taban çizgisi alır. 🔴 Webhook imza damgaları GERÇEK saatten
  gelir; sanal saat yalnız zamanlamayı ilerletir.
- **Logaritmik zaman şeridi** — 12 saniye ile 15 gün aynı şeride sığar. Atlama
  düğmeleri şeridin üzerinde, atlayacakları yerde durur.
- **Ham istek günlüğü** — *geliştirici ne gönderdi, biz ne döndük.* Satıra
  basınca istek ve yanıt gövdesi ham hâliyle açılır. Gizli başlıklar maskelidir.

Rayda **AÇIKLAMA** anahtarı vardır: kapalıyken tahta yoğundur, açıkken
terimlerin altı çizilir ve basınca açıklaması şeride düşer — `1220` teslim
çıpasıdır, `1300` zarf kapanışıdır, `S_APR` iki adımlıdır, süre dolması hata
değildir. Yoğunluk varsayılan, açıklama talep üzerine.

Adres çubuğu açık satırı taşır (`#/doc/<id>`): bir belgeyi bağlantı olarak
paylaşabilir, sayfayı yenileyince aynı satırı açık bulabilirsiniz.

---

## Yapılandırma

Bütün değişkenler açıklamalarıyla [`.env.example`](./.env.example) içinde.
Değerler yerel kurulumunuza aittir; `.env` depoya ve imaja girmez.

| Değişken | Varsayılan | Ne yapar |
|---|---|---|
| `MIMMOCK_MIMKIT_URL` | *(boş)* | **Zorunlu.** mimkit adresi — doğrulama + numaralama + görüntü (plan K4) |
| `MIMMOCK_MIMKIT_TOKEN` | *(boş)* | **Zorunlu.** mimkit anahtarı — bilgi@mimsoft.com.tr |
| `MIMMOCK_MIMKIT_SCOPE_ID` | *(boş)* | Seri numaralama kapsamı; boşsa gönderenin VKN'si |
| `MIMMOCK_MIMKIT_TIMEOUT_MS` | `30000` | mimkit çağrı zaman aşımı |
| `MIMMOCK_ALLOW_OFFLINE` | `0` | mimkit'siz kalk: yönetim çalışır, belge **almaz** (503) |
| `MIMMOCK_HOST_PORT` | `8088` | *(yalnız compose)* Ana makinede yayınlanan port |
| `MIMMOCK_PORT` | `8088` | Container içinde dinlenen port. `8080` bilerek seçilmedi (MimForge yığınında orası Temporal UI) |
| `MIMMOCK_DB` | *(boş)* | Boşsa gömülü SQLite. `postgres://…` verilirse dış PG |
| `MIMMOCK_DATA_DIR` | `/data` | SQLite dosyasının dizini (container'da birim) |
| `MIMMOCK_DB_AUTO_RESET` | `0` | Şema eskiyse veriyi silip yeniden kur |
| `MIMMOCK_PANEL_TOKEN` | *(boş)* | Panel kapısı. Boşsa panel açık (yerel sandbox) |
| `MIMMOCK_SEED` | `1` | Tohum veri yaz (kiracı `mimmock_dev_key`, iki şirket, tohum webhook) |
| `MIMMOCK_TRAFFIC_ENABLED` | `1` | Trafik üreteci |
| `MIMMOCK_TRAFFIC_INTERVAL_MS` | `120000` | Üretim aralığı |
| `MIMMOCK_TRAFFIC_BURST` | `1` | Her turda kaç belge |
| `MIMMOCK_TRAFFIC_SEED` | `mimmock` | Tohum — aynı tohum aynı akışı (ETTN'ler dahil) üretir |
| `MIMMOCK_ENGINE_TICK_MS` | `1000` | Motor tick aralığı — vadesi gelen geçişler bu sıklıkta uygulanır |
| `MIMMOCK_LOG_LEVEL` | `info` | `debug` · `info` · `warn` · `error` |

Env adları MimForge'unkilerden ölçülmüştür (`docs/m2-olcum-kittest-sozlesmesi.md` §3).

## API belgeleri ve istemci üretimi

- **`/docs`** — Scalar ile etkileşimli referans. Kimlik alanı tohum anahtarla
  dolu gelir; her ucu tarayıcıdan deneyebilirsiniz. İnternet bağlantısı
  gerektirmez: betik ve yazı yüzleri container'ın içinden sunulur, telemetri
  kapalıdır.
- **`/openapi.json`** — OpenAPI 3.1. `servers` alanı isteğin geldiği adresi
  yazar (container başka porttan yayınlanıyorsa doğru adres). Webhook gövdeleri
  de belgede (`webhooks`).

```bash
# TypeScript tipleri — ölçüldü: 2.600 satırlık tip dosyası üretir; üretilen
# `Document['status']` tipi 'FAILED' değerini derleme hatasıyla reddeder.
npx openapi-typescript http://localhost:8088/openapi.json -o src/mimmock.d.ts

# Başka diller için herhangi bir OpenAPI 3.1 üreticisi (ölçülmedi — Java ister):
npx @openapitools/openapi-generator-cli generate -i http://localhost:8088/openapi.json -g python -o ./mimmock-client
```

Yanıtlarda `Link` başlığı belgeleri gösterir (RFC 8631): `rel="service-desc"` →
OpenAPI, `rel="describedby"` → LLM kılavuzu, `rel="service-doc"` → `/docs`.
`GET /v1` bütün belge adreslerini döner.

## Geliştirme

```bash
pnpm install
pnpm --filter @mimmock/panel build     # panel derlenmeden sunulmaz
pnpm dev                               # http://localhost:8088

# testler ikiye ayrılır: ağ istemeyenler ve CANLI mimkit isteyenler
pnpm --filter @mimmock/server test:offline               # her yerde koşar
MIMMOCK_TEST_MIMKIT_URL=… MIMMOCK_TEST_MIMKIT_TOKEN=… \
  pnpm --filter @mimmock/server test:live                # sadakat + kapılar + numaratör + görüntü
MIMMOCK_TEST_PG=postgres://… pnpm test                   # + PostgreSQL (aynı gövde, iki sürücü)

pnpm typecheck
pnpm db:codegen                        # spec.ts → lehçe dosyaları
pnpm --filter @mimmock/server docs:gen # llms.txt, llms-full.txt, docs/openapi.json
```

Uç eklediyseniz ya da değiştirdiyseniz `server/src/docs/openapi.ts`'i güncelleyin;
`openapi.test.ts` belge ile sunucunun ayrışmasını kırmızıya çevirir. Kurallar:
[`AGENTS.md`](./AGENTS.md).

⚠️ Canlı testler mimkit olmadan **atlanmaz, düşer**. "Atlanan test = ölçülmemiş".

## Depo düzeni

```
server/            Fastify + Drizzle · motor · webhook · belge yüzeyi (src/docs)
panel/             Vite + React → build çıktısı server tarafından sunulur
docs/              openapi.json (üretilmiş) · ölçüm kayıtları · açık kalanlar
scripts/mimmock    kurulum ve işletim yardımcısı
llms.txt           LLM dizini (üretilmiş)
llms-full.txt      LLM tam kılavuzu (üretilmiş)
AGENTS.md          bu depoda çalışan kodlama ajanları için
.github/           CI: testler, çift sürücü, belge tazeliği, public depo kapıları
```

## Durum

| Faz | Kapsam | Durum |
|---|---|---|
| M1 | İskelet · çift sürücü · kimlik · `/v1/companies` | ✅ ölçüldü — `docs/m1-olcum.md` |
| M2 | Belge alma: JSON + UBL uçları · canlı şema/şematron · numaratör | ✅ ölçüldü — `docs/m2-olcum.md` |
| M3 | Durum makinesi · `_sandbox` · zaman · resend · **test imzası** | ✅ ölçüldü — `docs/m3-olcum.md` |
| M4 | Webhook: imza · yeniden deneme · günlük · elle gönderme | ✅ ölçüldü — `docs/m4-olcum.md` |
| M5 | Gelen belge: A→B döngü · iki adımlı akış · ticari yanıt | ✅ ölçüldü — `docs/m5-olcum.md` |
| M6 | e-Arşiv rapor yığını | ⏭️ atlandı — plan K2 rapor dilimini v2'ye aldı |
| M7 | Görüntü: mimkit-test şablonu · HTML/PDF | ✅ ölçüldü — `docs/m7-olcum.md` |
| M8 | Trafik üreteci: gerçek UBL · tohumlu · işaretli | ✅ ölçüldü — `docs/m8-olcum.md` |
| M9 | Panel: durum tahtası · olay ekseni · ham istek günlüğü · terim katmanı | ✅ ölçüldü — `docs/m9-olcum.md` |
| M9b | Belgeler: OpenAPI · `/docs` · LLM kılavuzu · kurulum yardımcısı · tek bağımlılık mimkit | ✅ ölçüldü — `docs/m9b-belgeler-ve-mimkit.md` |
| M10 | Paketleme · public depo | — |
