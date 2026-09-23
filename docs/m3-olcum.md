# M3 ölçümü — durum makinesi, `_sandbox`, zaman

**Tarih:** 2026-09-22 · **Plan:** §5a + §9/M3

> Plan M3'ün ölçüsü: *"her geçiş M0'da ölçülen koda karşılık geliyor mu."*
> Tablo VERİ olduğu için denetim de veri karşılaştırmasıdır (`transitions.test.ts`),
> davranış ise çalışan sistemde ölçüldü.

---

## 1. Motor — planın üç gerekçesi birebir korundu

| Plan §5a gerekçesi | Uygulama |
|---|---|
| **Yeniden başlatmaya dayanıklı** | Durum `documents` tablosunda (`scenario`, `next_state`, `next_at`). Bellekte `setTimeout` YOK. Test: motoru sıfırdan kurup `tick()` çağırınca belge yoluna devam ediyor |
| **Saat kumandası altında belirlenimli** | `_sandbox/clock` vadesi geleni **hemen** ateşler; tick vadesi gelen kalmayana dek döner |
| **Geçiş tablosu KOD DEĞİL VERİ** | `engine/transitions.ts` — motorda tek bir `switch (status)` yok |

### Geçiş tablosu

10 kural: `G5 G6 G7 G8 G12 G9 G10 G11 G15 G16`. (`G1–G4` ingest'te, motorda değil.)
Her satır `source: mimforge:<dosya>:<satır>` taşır; bir test bunu denetler.

🔴 **Sıra anlamlıdır:** `G12` (1230 → teslim geri alma) `G11`'den (düz terminal-fail)
**ÖNCE** gelir. `1230` terminal-fail kümesindedir ama `DELIVERED`'dan gelirse teslimi
geri alır. Ters kurulursa geri alma yolu hiç görünmez. Bunu sınayan bir test var ve
sırayı bozan mutasyon kırmızıya döndürüyor.

## 2. Senaryolar — plan §5a tablosu

| Senaryo | Ölçülen davranış (çalışan sistemde) |
|---|---|
| `happy` | `AWAITING_SIGNATURE → PROCESSING → SENT_TO_GIB → DELIVERED` (1220) → 1300 geldi, **durum değişmedi** |
| `receiver_reject` | teslimden sonra **1230 → `SEND_FAILED`, `deliveredAt` NULL'a düştü** |
| `gib_stalled` | `SENT_TO_GIB`'de (1210) **ASILI KALDI**; 16 gün atlanınca `POLL_DEADLINE` alarmı üretildi, **belge KAPANMADI** |
| `gib_error` | `SEND_FAILED` (1150) — terminal DEĞİL, resend yolu açık |
| `slow` | `happy` ×10; 30 sn'de teslim olmadı, 300 sn'de oldu |

### 🔴 Plan düzeltmesi korundu

Plan taslağı `gib_timeout → FAILED` diyordu. Sözlük §5 bunu ölçüp reddetmişti:
*"DEADLINE: alarm + AÇIK-BIRAK — kapatma YOK"*. Mock sadık davranıyor; ayrıca belge
düzleminde `FAILED` üreten **hiçbir yol yok** ve bunu bir test denetliyor.

## 3. `_sandbox` uçları (plan K11)

```
GET  /v1/_sandbox/scenarios                    senaryo kataloğu
POST /v1/_sandbox/documents/:id/advance        tek adım ilerlet
POST /v1/_sandbox/documents/:id/fail           arıza enjekte (ham GİB kodu)
POST /v1/_sandbox/documents/:id/scenario       senaryoyu değiştir
POST /v1/_sandbox/clock                        {advanceMs|advanceDays|to|reset}
POST /v1/_sandbox/reset                        veriyi sıfırla + tohum
```

Yanıtlar `X-MimMock-Sandbox: 1` taşır. `fail` geçiş üretmeyen bir kod alırsa
**sessizce yutmaz**: `applied: null` + açıklama döner (ara kodlar belgeye dokunmaz —
MimForge de öyle yapar).

## 4. Çalışan sistem ölçümü

`docker run -e MIMMOCK_ENGINE_TICK_MS=500 mimmock:m3`, beş senaryo paralel:

```
ORN…801 happy            DELIVERED    ham=1300  teslim=evet
ORN…802 receiver_reject  SEND_FAILED  ham=1230  teslim=HAYIR (geri alındı)
ORN…803 gib_stalled      SENT_TO_GIB  ham=1210  askıda
ORN…804 gib_error        SEND_FAILED  ham=1150
ORN…805 slow             PROCESSING   (25 sn sonra hâlâ yolda)
```

`_sandbox/clock` ile 16 gün atlandığında dönen geçişler:

```
no-transition  SENT_TO_GIB → SENT_TO_GIB  ham=1210  alarm=POLL_DEADLINE
G9             SENT_TO_GIB → DELIVERED    ham=1220  (slow belgesi)
```

Panelde senaryo ve "sırada" sütunları görünüyor; kumanda düğmeleri (`ilerlet`,
`1230 reddet`, `1150 hata`, saat) çalışıyor — panelden 1230 basıldığında belge
`DELIVERED → SEND_FAILED` oldu.

## 5. Test durumu

```
çevrimdışı 125 test
canlı       63 test   (kittest ister; yoksa ATLANMAZ, DÜŞER)
toplam     188 test
```

### Mutasyon sınaması — 19 kapı, 19'u da kırıldı

M3'te eklenen altı kapı:

| Mutasyon | Sonuç |
|---|---|
| `G12`'yi `G11`'den sonraya al (1230 geri alma kaybolur) | 1 kırmızı |
| `1300`'ü birincil teslim çıpası yap | 1 kırmızı |
| `gib_stalled`'ı `FAILED` ile bitir | 1 kırmızı |
| CAS guard'ı kaldır | 1 kırmızı |
| Birikimli zamanlamayı kaldır | 4 kırmızı |
| `deliveredAt` temizlemeyi kaldır (1230) | 1 kırmızı |

### Bu turda yakalanan üç hata

1. **Tick tek adım ilerletiyordu.** Saat 15 gün atlasa bile zincir bir adım
   yürüyordu; plan §5a-2'nin *"vadesi gelen TÜM geçişler ateşlenir"* vaadi
   tutmuyordu. Tick artık vadesi gelen kalmayana dek dönüyor.
2. **Zamanlama birikimli değildi.** Sonraki adım "şu anki saat + gecikme" olarak
   kuruluyordu; bu hem saat atlamayı hem *"container'ı kapatıp açar, belgeler yoluna
   devam eder"* vaadini bozuyordu. Taban artık kaçırılan adımın kendi vadesi.
3. **CAS guard'ı hiç test etmemiştim** — mutasyon "SAĞIR" dedi ve haklıydı. İki
   paralel `advanceOne` ile sınandı: yalnız biri uygulanıyor.

## 6. M3'te ÖLÇÜLMEYENLER

| Konu | Neden |
|---|---|
| **Webhook** | M4 |
| **Zarf düzlemi** (`NOT_COMPLETED`/`SUCCESSFUL`/`FAILED`) | Sözlük §3.1'in ikinci ekseni. Mock bugün yalnız belge düzlemini yürütüyor; zarf durumu M4/M5'te görünür hâle gelecek |
| **Zarf düzlemi ikinci ekseni** | Aşağıda ayrıca yazılı |

---

## 7. Yeniden gönderim (`G15`) — kullanıcı kararıyla uç açıldı

`POST /v1/documents/:id/resend`. Kapılar sözlük §4.3'ten:

| Durum | Yanıt |
|---|---|
| `DELIVERED` | 409 `ALREADY_DELIVERED` |
| `PROCESSING` / `SENT_TO_GIB` | 409 `SEND_IN_PROGRESS` |
| `SEND_FAILED` değil | 409 `NOT_RESENDABLE` |
| son kod **B sınıfı** | 409 `NEEDS_RESIGN` |
| son kod **C sınıfı** | 409 `NOT_RESENDABLE_GIB` |
| son kod **A sınıfı** veya tabloda yok | 200 → `PROCESSING` |

Resend sınıflaması SSOT'tan kopyalandı (`workflow-contract.ts:92-96`, 33 kod) ve bir
test hem sayıyı hem sınıf ayrıklığını denetliyor. Tabloda olmayan kod `null` döner ve
çağıran A gibi davranır — **bilinçli fail-open**, ölçülmüş karar.

## 8. 🔴 İMZA (K9) — test sertifikasıyla XAdES

Kullanıcı kararıyla M4'ten önce yapıldı.

### Ne üretiliyor

```
ext:UBLExtensions                       ← kökün İLK elemanı (GİB-XSD sırası)
  ext:UBLExtension
    ext:ExtensionContent
      sig:UBLDocumentSignatures
        sac:SignatureInformation
          ds:Signature                  ← enveloped, RSA-SHA256, exc-c14n
            ds:SignedInfo / ds:SignatureValue / ds:KeyInfo(X509Certificate)
            ds:Object
              xades:QualifyingProperties
                xades:SignedProperties
                  SigningTime · SigningCertificate(CertDigest SHA-256)

cac:Signature                           ← AYRI beyan elemanı (ÖE), gönderici party'den ÖNCE
```

### Sözleşme

| Eksen | Durum |
|---|---|
| İmza **algoritması** | GERÇEK — RSA-SHA256, belge özeti doğru |
| İmza **yapısı** | GERÇEK — ayrıştırıcı çalışır, `checkSignature()` geçer |
| **Güven zinciri** | 🔴 **KASTEN GEÇERSİZ** — sertifika kendinden imzalı |
| Bozma denemesi | Belge değişirse doğrulama **düşer** (test var) |

Görünürlük üç yerde: `GET /:id/xml` yanıtı
`X-MimMock-Signature: test-certificate; self-signed; chain-validation-fails-by-design`,
belge kaynağında `signature.chainValid: false`, panelde **TEST İMZASI** rozeti + üstte
kalıcı uyarı bandı.

### 🔴 CANLI ölçümün yakaladığı ÜÇ hata

Üçü de birim testlerde görünmedi; hepsi doğrulayıcıya sorulunca çıktı.

| # | Hata | Nasıl bulundu |
|---|---|---|
| 1 | Sarmalayıcılar imzadan **sonra** ekleniyordu → digest bozuluyordu | `checkSignature()` "hiçbir referans doğrulanmadı" dedi |
| 2 | xml-crypto kök `Invoice`'a `Id="_0"` ekliyordu → UBL XSD reddediyor (`"Invoice" elementinde "Id" niteliği kullanılamaz`) | canlı XSD. Çözüm: `isEmptyUri: true` (yalnız `uri: ''` YETMİYOR) |
| 3 | `cac:Signature` beyan elemanı eksikti | canlı XSD, **container'da**. İmzasız belge `unsigned-invoice` profiliyle doğrulanır ve o profil `cac:Signature` zorunluluğunu bastırır; imzalı belge TAM XSD'ye girer. Fikstürlerde bu eleman zaten vardı, **json2ubl-ts çıktısında yoktu** |

Üçüncüsünün alt hatası: ÖE adresinde `CitySubdivisionName` eksikti — UBL-TR'de zorunlu,
yoksa `CityName` "bu konumda geçersiz" oluyor.

**Son ölçüm (container):** JSON yolundan üretilen, motorun imzaladığı belge
**profilsiz tam XSD + şematrondan geçiyor** — `schema: true, schematron: true`.

### Test sertifikası — plan §2b kapı 3 artık GERÇEK bir kapı

`scripts/generate-test-cert.sh` üretir; CI beş şeyi denetler:
dizinde yalnız iki dosya · kendinden imzalı · adında `TEST` · adında
`GERCEK DEGIL`/`NOT A REAL` · `CA:FALSE` · anahtar sertifikayla eşleşiyor.

Kapı dört mutasyonla sınandı: gerçek görünümlü sertifika, `CA:TRUE`, dizine bırakılmış
fazladan anahtar, eşleşmeyen anahtar — **dördü de yakalandı**.

⚠️ Gizli-değer kapısı (kapı 2) `test-cert/` dizinini hariç tutar; orada bilerek açık
duran bir test anahtarı var. Bu bir delik değil: kapı 3 o dizini ayrıca denetliyor.

### ⚠️ İmzanın DÜRÜST SINIRI

`xades:SignedProperties` ayrı bir `ds:Reference` ile **imzalanmıyor**. Tam XAdES-BES
bunu ister. Mock'un hedefi plan §1'deki *yapısal geçerliliktir*: imza algoritması ve
belge özeti gerçek, XAdES nitelikleri beyan düzeyinde. Gerçek bir XAdES doğrulayıcısı
(EU-DSS vb.) bu belgeyi "XAdES-BES değil, düz XMLDSig + nitelik" diye niteler.

## 9. Son durum

```
çevrimdışı 163 test
canlı       78 test
toplam     241 test
```

Mutasyonla sınanan kapı sayısı: **23** (19 + resend/imza kapıları) — hepsi kırıldı.
