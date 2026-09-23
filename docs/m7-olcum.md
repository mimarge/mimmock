# M7 ölçümü — görüntü

**Tarih:** 2026-09-22 · **Plan:** §9/M7, §1, §4 · **Not:** M6 (e-Arşiv rapor) kullanıcı
kararıyla ATLANDI — plan K2 rapor dilimini v2'ye almıştı.

> Plan M7'nin ölçüsü: *"GERÇEKTEN ÇİZİLMİŞ çıktı, şablon kaynağının okunuşu değil."*

---

## 1. Ne kuruldu

```
GET /v1/documents/:id/html   → text/html      + X-MimMock-Template: <id>@<sürüm>
GET /v1/documents/:id/pdf    → application/pdf + content-disposition
GET /v1/templates            → şirket tanımında seçilebilecek şablonlar
```

Mock şablon dönüşümünü **kendisi uygulamaz**; CANLI mimkit'e çizdirir (plan K4 / §1
*"Şablon/görüntü: GERÇEK, mimkit-test"*). Sahte bir PDF üreten sandbox,
geliştiriciye şablonun gerçekte nasıl göründüğünü hiç göstermez — ve görüntü,
geliştiricinin **müşterisine gösterdiği tek şeydir**.

### Sözleşme (ölçüldü: `@mimarge/mimkit@0.8.0` `dist/tools.js`, `types.d.ts`)

```
POST {base}/v1/transform
  body: { source: { xmlBase64 }, <şablon kaynağı>, output: 'html' | 'pdf' }
  Accept: application/json → { htmlBase64 | pdfBase64, templateUsed, watermarkApplied }
  Accept: application/pdf  → HAM baytlar (base64 çözme maliyeti yok)
```

Şablon kaynağı beş yoldan verilebilir; mock ikisini kullanır:
`template: {id, version, docType}` (şirket seçtiyse, sürüm sabitli) ve
`resolve: {docType}` (mükellef/scope basamağı → sistem varsayılanı).

### ⚠️ Ölçülmüş tuzak — sessiz yanlış görüntü

`types.d.ts:585-590` birebir: `template` yolunda `docType` isteğe bağlıdır ve bir
**aidiyet beyanıdır**. Verilmezse tür şablondan okunur — *"yani e-Fatura çizdirip
e-Arşiv şablonunun id'sini vermek SESSİZCE e-Arşiv görünümü üretir."*

Mock `docType`'ı **her zaman** gönderir. Göndermemeyi deneyen mutasyon
(`M36`) ilk turda **SAĞIR** çıktı — o kapıyı test etmemiştim; çevrimdışı bir
istemci testi yazıldıktan sonra kırıldı.

## 2. 🔑 M7 ölçüsü — "gerçekten çizilmiş" nasıl ölçüldü

Test "200 döndü" ile yetinmiyor. Çizilen HTML'in **içinde** belgenin gerçek
alanları aranıyor:

| Ölçüt | Sonuç |
|---|---|
| Belge numarası (`ORN2026000000301`) | ✅ çıktının içinde |
| Gönderici unvanı (`ÖRNEK YAZILIM…`) | ✅ |
| Alıcı unvanı (`DENEME TİCARET…`) | ✅ |
| **Tutar Türkçe biçimde (`2.640,00`)** | ✅ |
| Ham XML biçimi (`>2640.00<`) sızmış mı | ✅ hayır |
| `<cbc:UBLVersionID>` sızmış mı | ✅ hayır |

🔑 **En güçlü kanıt tutar biçimi:** ham UBL'de `2640.00` yazar, çıktıda `2.640,00`
görünür. Şablon metni yalnız geçirmiyor, **Türkçe para biçimlendirmesi uyguluyor**
— şablon dönüşümü gerçekten koşmuş demektir. XML'i yankılayan sahte bir "görüntü" bu satırdan
geçemez (mutasyon `M34` bunu doğruluyor).

PDF bayt düzeyinde ölçülüyor: `%PDF-` imzası, son 1 KB'de `%%EOF`, boyut > 3 KB.

## 3. Çalışan sistem ölçümü

```
docker run -e MIMMOCK_MIMKIT_URL=… mimmock:m7

HTML: content-type text/html · x-mimmock-template: tpl_01M0A0DDZF0H0VS7KRMHEER221@1
      29 819 bayt · belge no ✓ · gönderici ✓ · alıcı ✓ · tutar (TR biçim) ✓

PDF : content-type application/pdf
      content-disposition: inline; filename="ORN2026000000301.pdf"
      57 978 bayt · imza %PDF- · %%EOF bulundu
      file(1): "PDF document, version 1.4, 1 pages"
```

Hangi şablonun çizdiği `X-MimMock-Template` başlığında görünür — *"neden böyle
göründü"* sorusunun cevabı.

## 4. 🔴 Canlı denemenin yakaladığı kusur — panel bağlantıları çalışmıyordu

Panele görüntü bağlantılarını düz `<a href="/v1/documents/:id/html">` olarak
koymuştum. **Tarayıcı o isteğe `Authorization` / `X-Panel-Token` başlığını
eklemez** — tıklandığında 401 gelirdi.

Testler bunu göremezdi: `app.inject()` başlığı elle veriyor. Kusur ancak panelde
düğmeye basılınca ortaya çıkar.

**Düzeltme:** panel görüntüyü `fetch` ile alır, `blob:` URL üretir ve onu açar.
Tarayıcıda doğrulandı: yeni sekme açıldı ve **başlığı `e-Fatura`** — yani şablonun
ürettiği `<title>`.

## 5. Görüntü servisi yokken

Görüntü, belge ALMAYI engellemez; bu yüzden K4'ün sert açılış kapısına **girmez**.
Adres verilmemişse mock ayakta kalır, belge almaya devam eder ve yalnız görüntü
uçları `503 TEMPLATE_UNAVAILABLE` der — sebebini de söyler
(*"MIMMOCK_MIMKIT_URL … Mock şablonu KENDİSİ çizmez"*).

## 6. Test durumu

```
çevrimdışı 189 test
canlı      121 test
toplam     310 test
```

### Mutasyon — M7'de eklenen 5 kapı, 5'i de kırıldı

| Mutasyon | Sonuç |
|---|---|
| HTML yerine ham XML döndür (sahte görüntü) | 1 kırmızı |
| PDF'i kırp (boş/eksik dosya) | 1 kırmızı |
| `docType` aidiyet beyanını gönderme | 1 kırmızı *(ilk turda SAĞIR)* |
| Görüntü servisi yokken sessizce boş dön | 1 kırmızı |
| Şablon 404'ünü genel hataya çevir | 1 kırmızı |

**Toplam mutasyonla sınanan kapı: 42.**

## 7. M7'de ÖLÇÜLMEYENLER

| Konu | Neden |
|---|---|
| **Şirketin şablon SEÇMESİ** (`templateId@version`) | Kod yolu var ve 404 kapısı test edildi, ama kittest şablon deposu BOŞ (`items: []`) — gerçek bir şablon seçilip çizdirilemedi |
| Filigran (`watermark`) | Sözleşmede var, mock kullanmıyor; taslak/iptal görüntüsü için gerekecek |
| Sayfa yapılandırması (`page`, yalnız PDF) | Aynı |
| e-Arşiv görüntüsü | M6 atlandı; `resolve: {docType: 'EARSIV'}` yolu kodda var, ölçülmedi |
