# M4 ölçümü — webhook

**Tarih:** 2026-09-22 · **Plan:** §7 + §9/M4

> Plan M4'ün ölçüsü iki cümledir:
> *"imza doğrulaması **bağımsız bir betikle** sınanır; **ölü-mektup gerçekten dolar**."*
> İkisi de aşağıda, çalışan sistemde ölçüldü.

---

## 1. Sözleşme — plan §7 birebir

```
imza          HMAC-SHA256(secret, timestamp + "." + body)     → v1=<64 hex>
başlıklar     X-MimMock-Signature · X-MimMock-Timestamp
              + X-MimMock-Event · X-MimMock-Sequence · X-MimMock-Delivery
tekrar penc.  ±5 dk
teslim        EN AZ BİR KEZ  (gövdede `deliverySemantics: "at-least-once"`)
sıralama      GARANTİ EDİLMEZ → her olayda sequence + documentVersion
yeniden dene  2s → 5s → 15s → 60s → 300s, sonra ÖLÜ MEKTUP (en çok 6 deneme)
günlük        GET /v1/webhooks/:id/deliveries · POST /v1/webhooks/:id/replay
```

Olaylar: `document.status_changed` (her geçişte) · `document.delivered` ·
`document.rejected` (🔑 `1230` geri alma) · `inbox.received` (M5) ·
`report.status_changed` (M6).

⚠️ **Başlık adı çakışması düzeltildi:** `/xml` ucunda kullandığım
`X-MimMock-Signature`, plan §7 tarafından webhook'a ayrılmıştı. Belge imzası
`X-MimMock-Document-Signature`'a taşındı.

## 2. 🔑 Kuyruk VERİTABANINDA

Motorla aynı gerekçe (plan §5a-1): container kapanıp açılınca bekleyen teslimler
kaybolmaz. Bellekte tutulan bir kuyruk her restart'ta "teslim edilmiş gibi"
davranırdı — **en-az-bir-kez** sözünün tam tersi.

Teslim döngüsü motordan **ayrı** bir tick'tedir: yavaş bir alıcı belge ilerleyişini
geciktirmemeli.

## 3. 🔑 K13 — çalışan webhook alıcısı

`docker run` der demez tohum bir webhook **mock'un kendi sink ucuna** bakar:
`POST /v1/_sandbox/webhook-sink`. Sink imzayı **gerçekten doğrular** ve sonucu saklar —
yani teslim günlüğü aynı zamanda imza sözleşmesinin canlı kanıtıdır.

🔴 Geçersiz imzayı **202 ile yutmaz**: 400 döner ve `signatureValid: false` olarak
kayda geçer. Sessizce kabul eden bir alıcı, bozuk bir imzalayıcıyı görünmez kılardı.

## 4. Çalışan sistem ölçümleri

### 4a. Teslim ve imza

```
docker run -e MIMMOCK_ENGINE_TICK_MS=500 mimmock:m4
→ tohum: webhook: http://127.0.0.1:8088/v1/_sandbox/webhook-sink

sink'e ulaşan olaylar:
  #4  document.delivered        imza=GEÇERLİ
  #3  document.status_changed   imza=GEÇERLİ
  #2  document.status_changed   imza=GEÇERLİ
  #1  document.status_changed   imza=GEÇERLİ

teslim günlüğü: dördü de `delivered`, deneme 1/6, HTTP 200
```

### 4b. 🔴 ÖLÜ MEKTUP gerçekten doldu

Erişilemeyen alıcı (`http://127.0.0.1:9`) + `_sandbox/clock` ile geri çekilme
adımları atlandı:

```
#10 dead  deneme=6/6  nextAttemptAt=None  hata=fetch failed
#8  dead  deneme=6/6  nextAttemptAt=None  hata=fetch failed
#6  dead  deneme=6/6  nextAttemptAt=None  hata=fetch failed
```

### 4c. 🔑 BAĞIMSIZ betik — M4 ölçüsünün tam karşılığı

`scripts/verify-webhook-signature.mjs` mock'un kodundan **hiçbir şey import etmez**;
yalnız `node:crypto` kullanır. Mock kendi doğrulayıcısıyla kendini doğrulasaydı iki
taraf birlikte yanlış olabilir ve test bunu göremezdi.

Gerçek bir HTTP alıcı kuruldu, container ona webhook gönderdi, gövde ve başlıklar
diske yazıldı, sonra betik dışarıdan koşturuldu:

```
BAĞIMSIZ betik  → {"valid":true}                              çıkış 0
yanlış anahtar  → {"valid":false,"reason":"mismatch"}          çıkış 1
```

Betik aynı zamanda geliştiricinin kopyalayabileceği **referans uygulamadır**.

## 5. 🔴 CANLI ölçümün yakaladığı tasarım hatası

İlk koşumda bağımsız betik gerçek teslimi **reddetti**:

```
{"valid":false,"reason":"stale","detail":"pencere dışında (±300000 ms)"}
```

**Sebep:** imza damgasını sanal saatten (`clock.now()`) alıyordum. `_sandbox/clock`
ile 16 gün ileri atlandığında damga da 16 gün ileri gitti; gerçek saatle doğrulayan
**her dış alıcı** teslimi reddederdi.

**Ayrım:** sanal saat belge AKIŞINI hızlandırmak içindir; tekrar penceresi bir
GÜVENLİK mekanizmasıdır ve dış dünyanın saatine göre çalışır. İkisini karıştırmak
sandbox'ta üretilen her webhook'u dışarıda geçersiz kılardı.

**Düzeltme:** imza damgası `Date.now()` (gerçek), zamanlama (`nextAttemptAt`) sanal
saatte kalır. Container'da yeniden ölçüldü — sanal saat 16 gün ileriyken bile damga
ile gerçek zaman farkı **0,6 sn** ve bağımsız betik kabul ediyor. Regresyon testi
eklendi.

Bu hata hiçbir birim testte görünmezdi: mock'un kendi sink'i de aynı sanal saati
kullandığı için **kendi imzasını kabul ediyordu**. Ancak dış bir alıcı ve dış bir
doğrulayıcı hatayı gösterdi.

## 6. Test durumu

```
çevrimdışı 176 test
canlı       95 test
toplam     271 test
```

### Mutasyon sınaması — M4'te eklenen 7 kapı, 7'si de kırıldı

| Mutasyon | Sonuç |
|---|---|
| İmzadan zaman damgasını çıkar (replay açılır) | 1 kırmızı |
| Tekrar penceresi kontrolünü kaldır | 2 kırmızı |
| Ölü mektubu kaldır (sonsuza dek dene) | 2 kırmızı |
| Geri çekilmeyi sabitle (üstel değil) | 1 kırmızı |
| Olay süzgecini yoksay | 1 kırmızı |
| Replay'de deneme sayacını sıfırlama | 1 kırmızı |
| Sink'te geçersiz imzayı 202 ile yut | 2 kırmızı |

**Toplam mutasyonla sınanan kapı: 30.**

Sonuncusu ilk turda **"SAĞIR"** çıktı — sink ucunu hiç test etmemiştim (K13'ün
parçası). Test yazıldıktan sonra kapı kırıldı.

## 7. M4'te ÖLÇÜLMEYENLER

| Konu | Neden |
|---|---|
| `inbox.received` olayı | Gelen belge M5'te doğuyor |
| `report.status_changed` olayı | e-Arşiv raporu M6'da doğuyor |
| Sıralamanın BİLEREK bozulması | Plan sıralama garantisi vermemeyi söylüyor; mock bugün sırayla gönderiyor. "Karıştır" kumandası plan §7'de istenmedi |
| Webhook silme/güncelleme ucu | Plan §4 uç listesinde yok |
