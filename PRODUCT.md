# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vite + React SPA, aynı Fastify sürecinden statik sunulur (tek container, tek port).
Karar plan K19'da verildi; mevcut kod bu seçimi zaten uyguluyor.

## Users

**Birincil:** muhasebe yazılımı geliştiricisi — MimForge'un e-Fatura/e-Arşiv API'sine
entegrasyon yazıyor.

**Kullanım sahnesi (kullanıcı onayı, 2026-09-22):** panel **ikinci ekranda sürekli
açık** duruyor. Geliştirici kod yazarken belge akışını ve webhook'ları göz ucuyla
izliyor; panele bakmak için işini bırakmıyor. Bu, yüzeyin yoğun bilgi taşıması,
canlı güncellenmesi ve durumun uzaktan okunabilir olması gerektiği anlamına gelir.

**İkincil (kullanıcı onayı):** depo public'tir (`github.com/mimarge/mimmock`, M10); GİB e-Fatura dünyasına
yeni geliştiriciler de kullanacak. Terimlerin ne anlama geldiği arayüzde
görünebilmeli — mock'un öğretici değeri buradan gelir.

🔑 **Bu ikisi gerilimlidir ve gerilim kasıtlıdır:** yoğunluk varsayılan, açıklama
TALEP ÜZERİNE. Uzman kullanıcıyı yavaşlatan bir öğreticilik katmanı kabul edilemez.

## Product Purpose

MimMock, MimForge'un **bugün yaptığı işin simülatörüdür**: geliştiricinin kendi
makinesinde `docker run` ile kaldırdığı bir sandbox. Amaç, entegrasyonu gerçek GİB
trafiğine çıkmadan, gerçek davranışa karşı denemektir.

Panelin tasarım problemi tek cümleyle (plan §8): **bir simülasyonu okunabilir kılmak.**
Geliştirici panele baktığında şu üç sorunun üçünü de cevaplayabilmeli:

1. **Ne oldu?** — hangi belge hangi duruma geldi, hangi istekler geçti/düştü
2. **Neden oldu?** — hangi geçiş kuralı, hangi ham GİB kodu, hangi alarm
3. **Şimdi ne olacak?** — sıradaki adım ne, ne zaman

Başarı ölçüsü: geliştirici bir entegrasyon hatasını **panele bakarak** teşhis
edebiliyorsa panel işini yapmıştır.

## Positioning

Rakip bir ürünün kopyalayamayacağı mekanizma: **davranış uydurulmamış, ÖLÇÜLMÜŞTÜR.**
Her durum kodu, her hata kodu ve her geçiş MimForge'un kaynağından `dosya:satır`
atfıyla çıkarıldı (`docs/mimmock-durum-ve-hata-sozlugu-2026-09-22.md`: 48 iç durum,
61 GİB ham kodu, 165 hata kodu, 41 geçiş satırı). UBL doğrulama, numaralandırma ve
görüntü **canlı gerçek servislerden** gelir; yalnız GİB taklittir.

## Constraints

- 🔴 **Bu yüzey GEÇİCİDİR** (plan §0). Yarın kurulacak gerçek geliştirici
  platformunun şartnamesi değildir. Panel bunu görünür biçimde söylemek zorundadır;
  sessiz bir panel "standart" izlenimi verir ve derin bağlanma yaratır.
- 🔴 **İmzalar TEST sertifikasıyladır**, zincir doğrulaması kasten başarısız olur
  (plan §1/K9). Her belgede görünür bir rozet şart.
- 🔴 **Üretilmiş trafik işaretli olmalı** (plan §5b). Geliştirici kendi trafiğiyle
  mock'un ürettiğini karıştırmamalı.
- **Public depo dört kapısı** (plan §2b): gerçek veri izi yok, gizli değer yok,
  test sertifikası gerçek olamaz, örnek korpus sentetik kimlik taşır.
- Gerçek GİB gönderimi hiçbir fazda YOKTUR.

## Terminology

Arayüzde geçen ve anlamı ölçülmüş terimler — yeni geliştirici için açıklanabilir
olmalı, uzman için kısaltılabilir:

| Terim | Anlamı |
|---|---|
| **ETTN** | Belgenin tekil kimliği (`cbc:UUID`) |
| **1220** | 🔑 Birincil teslim kodu — müşteri-görünen teslim anı, TTK 8 gün buradan işler |
| **1300** | Zarf kapanışı; belge teslimi için yalnız fallback |
| **1230** | Teslimi GERİ ALIR (`DELIVERED → SEND_FAILED`, damga düşer) |
| **S_APR** | Sistem yanıtı; GELEN belgede ikinci adımın teyidi |
| **DOCUMENT_NOT_SETTLED** | S_APR teyitlenmeden ticari yanıt verilemez |
| **POLL_DEADLINE** | 15 gün doldu; belge KAPANMAZ, yalnız alarm üretilir |

## Accessibility

Yerel geliştirici aracı; bilinen bir erişilebilirlik taahhüdü yoktur. Yine de
durum yalnız RENKLE anlatılmamalı — panel ikinci ekranda, çoğu zaman göz ucuyla
okunuyor ve renk körlüğü oranı bu kitlede de geçerli.

## Open decisions

- Panelin kendi kimlik kapısı (`MIMMOCK_PANEL_TOKEN`) yerel sandbox'ta varsayılan
  olarak kapalı; public bir kuruluma açılırsa bu kararın gözden geçirilmesi gerekir.
