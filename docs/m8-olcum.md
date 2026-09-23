# M8 ölçümü — trafik üreteci

**Tarih:** 2026-09-22 · **Plan:** §9/M8, K16, §5b

> Plan M8'in ölçüsü: *"üretilen her belge GERÇEK şematrondan geçmeli; aynı tohum
> aynı trafiği vermeli."* İkisi de çalışan sistemde ölçüldü.

---

## 1. Ne kuruldu

```
harici gönderici havuzu (mock'ta ŞİRKET OLARAK TANIMLI DEĞİL)
        │
        ├── senaryo kataloğu: duz · iskontolu · dovizli · tevkifatli · ticari
        │
        ├── json2ubl-ts ile ÜRETİLİR
        │        ↓
        ├── 🔴 CANLI ŞEMATRON — geçmezse belge YAZILMAZ, red raporlanır
        │        ↓
        └── tanımlı şirketlerin gelen kutusuna (iki adımlı akış) + webhook
```

Kumanda: `POST /v1/_sandbox/traffic` (elle tetikle) ·
`POST /v1/_sandbox/traffic/reset` (tohumu sıfırla).
Ayarlar: `MIMMOCK_TRAFFIC_ENABLED` (varsayılan **açık**), `MIMMOCK_TRAFFIC_SEED`,
`MIMMOCK_TRAFFIC_INTERVAL_MS` (varsayılan 120 sn), `MIMMOCK_TRAFFIC_BURST`.

## 2. Plan §5b'nin beş kuralı — tek tek

| Kural | Uygulama |
|---|---|
| 🔴 **Üretilen trafik GERÇEK UBL, şematrondan geçer** | Geçmeyen belge **yazılmaz**; red sebebi `results[].errors`'ta ve günlükte |
| **Tohumlu** (`MIMMOCK_TRAFFIC_SEED`) | mulberry32; **ETTN'ler bile tohumdan** türer, `crypto.randomUUID()` kullanılmaz |
| **Hız ayarlanabilir, varsayılan düşük ama AÇIK** | 2 dakikada 1 belge; sandbox canlı ama gürültüsüz |
| **Panelde ve günlükte İŞARETLİ** | `generated` + `generatedScenario` kolonları; panelde mavi rozet; webhook gövdesinde de |
| **Gönderici mock'ta tanımlı DEĞİL** | Havuzdaki beş VKN hiçbir zaman şirket olarak tanımlanmaz — bir test bunu her koşumda doğrular |

## 3. Çalışan sistem ölçümü

```
docker run -e MIMMOCK_TRAFFIC_INTERVAL_MS=4000 -e MIMMOCK_TRAFFIC_BURST=2 \
           -e MIMMOCK_TRAFFIC_SEED=demo mimmock:m8

[mimmock] trafik üreteci açık · tohum: demo · her 4 sn'de 2 belge

14 sn sonra → gelen kutusu: 6 belge · üretilmiş: 6
senaryolar: {tevkifatli: 2, duz: 3, ticari: 1}
  TRF2026362591680  gönderen=6666666666  tevkifatli  RECEIVED  yanıt=NONE
  TRF2026799225539  gönderen=7777777777  ticari      RECEIVED  yanıt=AWAITING
reddedilen: 0
```

🔑 Üretilmiş belge de **iki adımlı** akışı izliyor: `RECEIVED` ile başlıyor,
S_APR teyidiyle `DELIVERED` oluyor. Ticari fatura yanıt bekliyor, düz fatura
beklemiyor — yani üretilen trafik gerçek gelen belge yolundan geçiyor.

### Determinizm (aynı tohum → aynı trafik)

```
koşum 1: duz/4444444444  duz/7777777777
koşum 2: duz/4444444444  duz/7777777777   ✓ AYNI
```

### Duplicate sessizce yutulmuyor

Veri silinmeden tohum resetlenirse aynı ETTN'ler yeniden üretilir ve yazma
reddedilir. Bu **determinizmin doğal sonucudur, hata değildir** — ayrı bir alanla
raporlanır:

```
üretildi=0  duplicate=2  reddedildi=0
```

Sessizce "üretildi" saymak, "üreteç durdu mu?" sorusunu cevapsız bırakırdı.

## 4. 🔴 İki kez sağır çıkan kapı — M8'in en öğretici kısmı

En kritik kapı (**canlı şematron**) mutasyon bataryasında **iki kez** "SAĞIR" çıktı:

**Birinci deneme.** Kapıyı kaldırdım, hiçbir test kırılmadı — çünkü katalogdaki
tüm senaryolar zaten geçerli UBL üretiyordu. Kapı hiç denenmemişti.

**İkinci deneme.** "Bilerek bozuk" bir senaryo yazdım. Yine sağır: o senaryo
**json2ubl-ts'in kendi kapısından** düşüyordu ve şematrona hiç ulaşmıyordu. Test
yeşildi ama ölçtüğünü sandığı şeyi ölçmüyordu.

**Üçüncü deneme — doğru olan.** Geçerli bir belgeyi **RET diyen bir doğrulayıcıya**
verdim. Kapı kaldırılınca test kırmızıya döndü.

Ders: *bir kapıyı sınamak için ona kapatması gereken şeyi vermek gerekir; "bozuk
bir şey üret" yetmez, bozukluğun O KAPIYA ulaştığından emin olmak gerekir.*

Bu ayrıca üreteci daha test edilebilir yaptı: senaryo kataloğu ve doğrulayıcı
artık enjekte edilebiliyor.

## 5. Bu turda yakalanan bir hata daha

**Üreteç gelecek tarihli fatura üretiyordu.** Ay/gün rastgele çekiliyordu ve zaman
zaman bugünden ileri bir tarih çıkıyordu; json2ubl-ts bunu `Geçersiz değer:
issueDate` ile reddediyordu. Kütüphane haklıydı — fatura tarihi gelecekte olamaz.
Tarih artık son 45 günden seçiliyor ve belge-no seri yılı belge tarihiyle
hizalanıyor (`DOCNO_YEAR_MISMATCH` kapısı).

🔑 Bu, plan §5b'nin *"bedava fayda"* sözünün ilk kanıtı: **üreteç mock'un kendi
kendini sınamasıdır.** Üretim bozulduğunda bunu ilk gören üreteç oldu.

## 6. Test durumu

```
çevrimdışı 189 test
canlı      134 test
toplam     323 test
```

### Mutasyon — M8'de eklenen 6 kapı, 6'sı da kırıldı

| Mutasyon | Sonuç |
|---|---|
| 🔴 Canlı şematron kapısını kaldır | 1 kırmızı *(iki kez SAĞIR çıktıktan sonra)* |
| Tohumu yoksay (`Math.random`) | 3 kırmızı |
| Üretilen belgeyi işaretleme | 1 kırmızı |
| Göndericiyi tanımlı şirketlerden seç | 2 kırmızı |
| Doğrulayıcı yokken de üreteç kur | 1 kırmızı |
| Duplicate'i sessizce yut | 1 kırmızı |

**Toplam mutasyonla sınanan kapı: 48.**

## 7. M8'de ÖLÇÜLMEYENLER

| Konu | Neden |
|---|---|
| **`iade` senaryosu** | Plan §5b sayıyor ama iade faturası `billingReference` ile ÖNCEKİ bir faturaya atıf yapmak zorunda; üretecin elinde o fatura yok ve uydurulmuş referans "gerçek UBL" kuralını çiğnerdi. Üreteç kendi ürettiği faturayı referans alabilir hâle geldiğinde eklenecek |
| **"Giden tarafa da cevap verir"** (plan §5b) | Geliştiricinin kestiği `TICARIFATURA`'ya bir süre sonra ticari yanıt gelmesi (sözlük §3.3 Y7/Y8). Gelen yön kuruldu, giden yönün yanıt tüketimi kurulmadı |
| **İstek günlüğü işareti** | Plan §5b *"panelde ve İSTEK GÜNLÜĞÜNDE işaretli"* diyor. Panelde var; istek günlüğü (plan §8) henüz yok — M9'un işi |
| **e-Arşiv trafiği** | Üreteç yalnız e-Fatura üretiyor (gelen kutusu e-Fatura düzlemi) |
