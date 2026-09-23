# M2 ölçümü — belge alma

**Tarih:** 2026-09-22 · **Plan:** §9/M2 · **Sözleşme ölçümü:** `docs/m2-olcum-kittest-sozlesmesi.md`

> Plan M2'nin ölçüsü: *"MimForge'un kabul ettiği fikstür kabul, reddettiği ret (§6)."*
> Aşağıdakiler çalışan sistemde ölçüldü. En önemli bulgu §2'dedir ve planın bir
> varsayımını düzeltir.

---

## 1. Ne kuruldu

| Parça | Durum |
|---|---|
| `POST /v1/documents` (JSON → json2ubl-ts → UBL) | ✅ **202 + `{ettn}`** |
| `POST /v1/documents/ubl` (ham XML) | ✅ 202 |
| `GET /v1/documents` (sayfalama + süzgeç) · `/:id` · `/:id/xml` | ✅ |
| CANLI şema/şematron (K4) | ✅ canlı ölçüldü — 2026-09-23'ten beri mimkit üzerinden (`m2-olcum-kittest-sozlesmesi.md` §1) |
| mimkit numaratör istemcisi (K6) | ✅ **canlı ölçüldü** (§4b) |
| Numarasız belge yolu (reserve + `cbc:ID` göm) | ✅ uçtan uca canlı |
| İngest kapıları — sözlük §4.2 sırası | ✅ 16 kapı |
| `documents` tablosu (iki lehçe, tek tariften) | ✅ |
| Panelde belge listesi | ✅ iskelet düzeyinde (tasarım M9) |

## 2. 🔴 ÖLÇÜLEN DÜZELTME — sözlük §7.1'in "hepsi KABUL bekliyor"u bir BEKLENTİYMİŞ

Sözlük §7.1: *"`packages/tpl-forge/samples/**` — 28 XML, **hepsi KABUL bekliyor**."*

**Canlı doğrulayıcıya soruldu. v1 kapsamındaki 15 belgeden yalnız 4'ü geçiyor:**

| Sonuç | Adet | Dosyalar |
|---|---:|---|
| KABUL | **4** | `EFATURA-01-temel-satis` · `EFATURA-06-hks-komisyoncu` · `EFATURA-07-belge-artirim` · `EARSIV-06-hks-komisyoncu` |
| RET (XSD) | **11** | kalan hepsi |

**Sebep ölçüldü:** `cac:Address` içinde element sırası hatası —
`"CityName" elementi bu konumda geçersiz. Bu noktada beklenen: BlockName,
BuildingName, BuildingNumber…`. Bir dosyada ayrıca şematron reddi var
(`WithholdingTaxTotalCheck`, `TaxTypeCode '9015'`).

**Neden böyle:** bu fikstürler `tpl-forge` paketindedir, yani **görünüm şablonu
(görüntü dönüşümü) testleri** için üretilmişlerdir. İngest'ten geçirildikleri hiç ölçülmemiş;
sözlüğün "KABUL bekliyor" ifadesi bir çıkarımdı.

### Sadakat testi buna göre yeniden kuruldu

Beklenti artık **dosya adından değil, referans kararından** gelir:

```
  belge ──┬─→ referans doğrulayıcı (MimForge'un tip/profil parametreleriyle) ──→ karar A
          └─→ mock ingest                                                    ──→ karar B
                                       A ≡ B  olmalı
```

- referans KABUL → mock **202** dönmeli
- referans RET → mock **400 `SCHEMA_INVALID`** dönmeli (aynı eksenden!)

Bu kuruluş plan §6'nın lafzına sadıktır (*"kabul ettiğini kabul, reddettiğini ret"*
— "hepsini kabul" değil) ve **"bedava büyür"** özelliğini korur: korpusa yeni belge
girdiğinde beklentisini kimsenin elle yazması gerekmez.

Ayrıca referans kararlarının kendisi teste **sabitlendi** (4/15 + dosya bazında
harita). Korpus ya da doğrulayıcı değişirse test kırmızıya döner — sessiz kayma yok.

## 3. Sadakat korpusu deponun içinde

15 XML `server/src/__fixtures__/fidelity/accept/` altına **kopyalandı** (import
edilmedi — MimForge private). Plan §2b kapı 4 izni ölçümle doğrulandı:

| Eksen | Ölçüm |
|---|---|
| VKN/TCKN | `1111111111` `2222222222` `3333333333` `33333333333` `4444444444` — hepsi tek rakam tekrarı |
| Taraf adları (`cac:PartyName`) | `ÖRNEK …` · `DENEME …` · `ORNEK EXAMPLE TRADING GMBH` |

`corpus-identity.test.ts` bu kapıyı her koşumda **yeniden ölçer** (ağ istemez).

⚠️ Bu kapıyı yazarken bir **sahte kırmızı** yakalandı: ilk süzgeç `<cbc:Name>`
etiketlerinin tümünü taradığı için banka şube adını ("Kızılay Kurumsal Şubesi")
taraf adı sanıyordu. Kapı `cac:PartyName` ile daraltıldı.

## 4. Çalışan sistem ölçümleri

`docker run -e MIMMOCK_MIMKIT_URL=… -e MIMMOCK_MIMKIT_TOKEN=… mimmock` (2026-09-23'ten beri)

| Ölçüm | Sonuç |
|---|---|
| `/healthz` | `kittest.validatorReachable: true`, şema `edfbdbba` |
| JSON yolundan belge | **202**, `ettn` döndü, `status: AWAITING_SIGNATURE` |
| Belge okundu | `type=EFATURA` · `payableAmount=1200.00` · damga `UBL-Invoice-2.1.xsd` / `UBLTR_MAIN` |
| Üretilen UBL geri alındı | ✅ `GET /:id/xml` |
| Panel | belge listesi görünüyor (durum + ham GİB sütunu yan yana, plan §5) |

## 4b. 🔴 Numaratör — CANLI ölçüldü (kullanıcı env değerlerini verdi)

Sözleşme ölçümü doğrulandı ve **üç yerde yanlış kurulmuştu**; üçü de canlı çağrıyla
ortaya çıktı:

| Bulgu | Ölçüm | Etki |
|---|---|---|
| `X-Scope-Id` **zorunlu** | scope'suz istek → `400 SCOPE_REQUIRED` | Mock hiç numara alamazdı |
| Hata gövdesi `{error:{code,message}}` | düz `{code,message}` beklenmişti | Kapının sebebi `undefined` görünüyordu |
| `reserve` **önek değil seri KİMLİĞİ** ister | önekle → `404 NO_DEFAULT_SERIES` | Numarasız yol hiç çalışmazdı |

Scope, MimForge'da **aktif şubedir** (`routes.series.ts:13`); mock'ta şubenin
karşılığı şirkettir (plan §3), bu yüzden varsayılan kapsam mükellefin VKN'sidir.
Seri, önekten kimliğe çözülür; yoksa açılır (MimForge'un K-N7 onarım deseni).

**Canlı sonuç:**

```
resolveSeriesId('MMT', EFATURA)  → ser_01M34F…
reserve(key=A)                   → MMT2026000000001   replayed=false
reserve(key=A)  (aynı anahtar)   → MMT2026000000001   replayed=true   ✓ mükerrer YAKILMADI
reserve(key=B)  (yeni anahtar)   → MMT2026000000002   replayed=false  ✓ sıra ilerledi
```

Numara `DOCNO_FORMAT_RE` (`^[A-Z0-9]{3}20\d{2}\d{9}$`) ile birebir uyumlu —
yani mock'un kendi ingest kapısı kendi aldığı numarayı kabul ediyor.

### Uçtan uca: numarasız belge

`cbc:ID`'si sökülmüş fikstür → ingest → mimkit reserve → numara **belgeye gömülür**
→ gömülmüş belge **yeniden canlı doğrulayıcıya sorulur** ve geçer. Gömme yeri
tesadüfi değil: UBL XSD element sırası katıdır, `cbc:ID` `ProfileID`'den sonra
gelmelidir — yanlış yer, korpusun 11 dosyasını düşüren hata sınıfını üretirdi.

#### Bu ölçümde yakalanan iki hata daha

1. **Ayrıştırıcı taraf VKN'sini belge numarası sanıyordu.** `cbc:ID` UBL'de onlarca
   yerde geçer; kök ID sökülmüş bir belgede naif "ilk ID" araması
   `<cbc:ID schemeID="VKN">1111111111</cbc:ID>` buluyor ve numarasız belgeyi
   "numaralı" sayıyordu (`SERIES_PREFIX_NOT_APPLICABLE`). Kök tespiti taraf/uzantı
   bloklarını sökerek ve **özniteliksiz** ID arayarak düzeltildi; 15/15 fikstürde
   doğrulandı.
2. **Gömme bekçisi aynı hatayı yapıyordu** ve "belgede zaten ID var" diyerek her
   gömmeyi reddediyordu; üstelik fırlattığı istisna `500 INTERNAL`'a düşüyordu.

### 🔴 K4 kapısı — çalışan sistemde ölçüldü

| Kip | Sonuç |
|---|---|
| Doğrulayıcı erişilemez, `MIMMOCK_ALLOW_OFFLINE` yok | **container exit=1.** Hata mesajı sebebini söylüyor |
| `MIMMOCK_ALLOW_OFFLINE=1` | Kalkar ama `/healthz` → **HTTP 503 `degraded`**; belge uçları **`OFFLINE_MODE`**; şirket uçları çalışır; açılışta uyarı |

Sessiz düşük-sadakat kipi yok — ikisi de yüksek sesle.

## 5. 🔴 M2'de ÖLÇÜLMEYENLER (dürüst liste)

| Konu | Neden |
|---|---|
| **`claim` ucu** (dışarıda kesilmiş numaranın beyanı, §4.5) | Mock bugün yalnız `reserve` kullanıyor. K6'nın "geliştirici kendi numarasını verir" yarısı mock'un kendi `DUPLICATE_DOCNO` kapısıyla karşılanıyor; mimkit defterine beyan edilmiyor |
| **İmza / test sertifikası** | M2 kapsamında değil. `GET /:id/xml` belgeyi olduğu gibi döner; XAdES M3'ün imza adımı (plan §1/K9) |
| **json2ubl-ts ret matrisi (94 senaryo)** | Ayrı depoda (`examples-matrix/invalid/`). Mock'un JSON kapısı kendi testleriyle sınandı; 94'lük küme koşulmadı |
| **CI'da sadakat** | CI işi `MIMMOCK_MIMKIT_URL` değişkeni tanımlıysa koşar, değilse **atlanır ve bu görünür** (`acik-kalanlar.md` §19) |

## 6. Test durumu

```
çevrimdışı 111 test   (CI her zaman koşar — ağ istemez)
canlı       51 test   (kittest ister; kittest yoksa ATLANMAZ, DÜŞER)
toplam     162 test
```

### Mutasyon sınaması — 13 kapı, 13'ü de kırıldı

| Mutasyon | Sonuç |
|---|---|
| Kök TaxTotal yerine ham sayım | **15 test kırmızı** |
| Sicil kapısını kaldır (`RECEIVER_NOT_REGISTERED`) | 1 kırmızı |
| Belge-no biçim kapısını gevşet | 1 kırmızı |
| Doğrulama sonucunu yoksay | 11 kırmızı |
| 5xx/408/429 ↔ 4xx ayrımını boz | 5 kırmızı |
| Zarf hatasını "geçersiz belge" say | 1 kırmızı |
| Ölü durum bekçisini kaldır | 4 kırmızı |
| Şematron ipucunu BÜYÜK harfe çevir | 1 kırmızı |
| Kök ID tespitini naif hâline döndür | 3 kırmızı |
| Numarayı belgeye gömme | 2 kırmızı |
| `idempotency-key`'i her çağrıda yenile | 1 kırmızı |
| `x-scope-id` başlığını kaldır | 4 kırmızı |
| Seri çözümünü önek göndermeye döndür | 2 kırmızı |

### Bu turda yakalanan beş hata

1. **Sahte kırmızı olurdu:** `TaxTotal` ham sayımı kalem içindekileri de sayıyordu →
   MimForge'un kabul ettiği **her** belgeyi reddederdi. Kök seviyesine daraltıldı.
2. **Sahte yeşil olurdu:** `hasSignature` UBL'in zorunlu `cac:Signature` elemanını
   gerçek imza sanıyordu. Ölçüldü: korpusun hiçbirinde `ds:Signature` yok.
   `SignatureValue` ile daraltıldı.
3. **Ölçüm betiğim yanılttı:** toplu mutasyon betiği iki kapı için "SAĞIR" raporladı;
   tek tek koşulunca ikisi de kırmızıya döndü (15 ve 1 test). Betiğin çoklu dosya
   filtresi tutmamıştı — bekçiyi ölçen aracın kendisi de ölçülmeliymiş.
4. **Ayrıştırıcı taraf VKN'sini belge numarası sanıyordu** (§4b).
5. **Gömme bekçisi her gömmeyi reddediyordu** ve hatası 500'e düşüyordu (§4b).

Beşinin de ortak noktası: hiçbiri birim testte görünmedi, **canlı koşumda** çıktı.
