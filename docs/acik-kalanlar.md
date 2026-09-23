# Açık kalanlar — planın §10'unun devamı

> Plan `mimforge/docs/superpowers/plans/2026-09-22-mimmock.md` **salt okunur referanstır**;
> MimForge deposuna yazılmaz. Bu yüzden uygulama sırasında çıkan belirsizlikler
> planın §10'una değil buraya yazılır. Numaralar §10'un devamıdır.

---

## 11. Hata alanı adı: `code`/`message` mi, `errorCode`/`reason` mı?

**Çelişki.** Plan K10: *"Hata `code` İngilizce ve KARARLI, `message` Türkçe."*
Sözlük §9-8 (ölçüme dayalı devir notu): *"MimForge'ta bu zaten böyle: `errorCode`
İngilizce sabit, `reason` Türkçe metin. Mock aynı ikiliyi korumalı; MimForge'un alan
adları `errorCode`/`reason`'dır."*

**M1'de alınan karar:** ölçülmüş olan uygulandı → gövde `{ errorCode, reason }`,
alan hataları `errors[]`. K10'un "code/message" ifadesi kavramsal okundu.

**✅ KAPANDI (kullanıcı, 2026-09-22):** `errorCode` + `reason` onaylandı. Ölçülmüş
olan kazandı; K10'un "code/message" ifadesi kavramsal okunuyor.

## 12. Public depo ne zaman açılacak?

Kullanıcı talimatı: *"depo `github.com/mimarge/mimmock` AYRI ve PUBLIC (gh ile SEN
açacaksın)"*. Zamanlama yazılmadı.

**M1'de alınan karar:** yalnız **yerel** `git init` yapıldı; GitHub'a hiçbir şey
gönderilmedi. Gerekçe: §2b'nin dört kapısından ikisi henüz yok (test sertifikası M2'de,
örnek korpus M8'de doğuyor), ve public bir depoya kapılar kurulmadan içerik göndermek
riski tersten alır.

**✅ KAPANDI (kullanıcı, 2026-09-22):** depo **M10'da** açılacak. O ana dek yerel git
deposunda çalışılır. `gh repo create --public` + push, dört kapı CI'da yeşil olunca.

⚠️ Hâlâ kullanıcıda: `kittest.mimforge` public olunca bilinen bir host hâline gelir;
o hostun kimlik/oran-sınırı/yalıtım gereksinimi **altyapı kararıdır** (plan §2b sonu).

## 13. Drizzle'ın "tek şema" vaadi eksikti — nasıl kapatıldı

Plan K18 Prisma'yı *"`provider` şema düzeyinde SABİT → iki şema + iki istemci = kopya"*
diye eledi ve Drizzle'ı *"tek şema tanımı"* diye seçti. **Ölçüldü: bu tam doğru değil.**
Drizzle'da `sqliteTable` ile `pgTable` ayrı API'lerdir; naif kurulumda tablo tanımı iki
kez yazılır — yani elenen gerekçe geri gelir.

**M1'de alınan çözüm:** şema tek yerde **veri** olarak tarif edilir
(`server/src/db/spec.ts`), iki lehçenin Drizzle dosyası ondan **üretilir**
(`db/codegen.ts` → `db/dialects/*.generated.ts`). Üretilmiş dosyalar elle
düzenlenmez; CI güncelliği denetler (`db:codegen:check`) ve `schema-parity` testi
iki lehçenin kolon kümesini karşılaştırır. Runtime DDL de aynı tariften üretilir.
Lehçe farkı **iki eşleme tablosunda** yaşar, sorgu gövdesinde `if` yoktur.

Bilgi olarak yazılıyor; bir karar beklemiyor.

## 14. `schematronTypeFor` / kittest uç adresleri M2'de gerekecek

K4 mock'u ağa bağlı tasarlıyor: şema/şematron, numaratör ve şablon canlı gelecek.
**✅ KARARLAŞTI (kullanıcı, 2026-09-22):** MimForge'un env **adları ölçülüp** aynı
desen kullanılacak (envanter §6.1). Değerler kurulumda verilir; mock ağsız KALKMAZ (K4).

Kalan küçük belirsizlik: CI'da kittest erişimi yoksa M2'nin sadakat testleri
koşamaz. CI için ya erişim verilir ya da o testler ayrı bir iş olarak işaretlenir.

## 15. Sözlüğün "bulunamayanları" M2'yi bekliyor

Sözlük §6-D: ~19 GİB kodunun metni kodda yok, e-Arşiv `150-167` aralığı adlandırılmamış,
ticari yanıt `ResponseCode` tam kümesi yok. Plan §10-7: *"Mock bunları üretmeden önce
kaynak bulmalı."* Kaynak `docs/gib-skills` (normatif belge) olarak işaret edilmiş.
M3 (motor) bu metinlere ihtiyaç duyacak.

## 16. `POST /v1/documents` başarı kodu: 201 mi 202 mi?

**Çelişki.** Plan §4 uç listesi: *"`POST /v1/documents` JSON → UBL → doğrula → **201**"*.
Sözlük §4.2 (ölçüm): *"Rota `routes.documents.ts:293`. Başarı: **`202` + `{ ettn }`**
(`:1921`)"*.

**M2'de alınan karar:** ölçülmüş olan uygulanıyor → **`202` + `{ ettn }`**. Gerekçe:
MimForge'un kabulü asenkrondur (belge alınır, işleme devam eder) ve mock'un motoru
(M3) durumu tam da bu yüzden ilerletecek. `201` senkron bir tamamlanma vaat ederdi ve
M3'te geri alınması gerekirdi.

§11'deki karar da aynı yönde alınmıştı (plan lafzı vs. ölçüm → ölçüm kazanır);
tutarlılık için burada da öyle yapıldı. **Kullanıcı aksini isterse M3'e girmeden
söylemeli.**

## 17. Sadakat korpusunun kabul oranı ölçüldü: 15'te 4

Sözlük §7.1 `tpl-forge/samples` için *"hepsi KABUL bekliyor"* diyordu. **Ölçüldü:
v1 kapsamındaki 15 belgeden 4'ü canlı doğrulayıcıdan geçiyor**, 11'i XSD element
sırası (`cac:Address` içinde `CityName`) yüzünden düşüyor. Bu fikstürler görünüm
şablonu testleri için üretilmiş; ingest'ten geçirildikleri hiç ölçülmemiş.

Sadakat testi buna göre yeniden kuruldu: beklenti dosya adından değil **referans
doğrulayıcının kararından** gelir (`docs/m2-olcum.md` §2).

**Kullanıcıya bilgi / karar:** MimForge'un pozitif sadakat korpusu bugün yalnız
**4 belge** genişliğinde. İki seçenek:

- (a) olduğu gibi bırak — mock MimForge'la aynı kararı veriyor, sadakat sağlanıyor;
- (b) `json2ubl-ts/examples-matrix/valid` (242 senaryo) kabul tarafına eklenir —
  o küme kütüphanenin ürettiği belgelerden oluştuğu için XSD sırası doğrudur ve
  korpusu 60 katına çıkarır. Bedeli: ayrı depoya bağımlılık (sözlük §7.3'ün
  işaret ettiği sınır).

## 18. `@mimarge/mimkit` npm'de public değil

Ölçüldü: `npm view @mimarge/mimkit` → **404**. Mock public depo olacağı için SDK'ya
bağımlı olamaz; numaratör istemcisi ölçülmüş HTTP sözleşmesinden **elle yazıldı**
(`server/src/kittest/numbers.ts`).

**✅ KAPANDI (2026-09-22):** kullanıcı MimForge env değerlerini işaret etti; numaratör
**canlı ölçüldü** (`docs/m2-olcum.md` §4b). Üç sözleşme hatası canlı çağrıyla ortaya
çıktı ve düzeltildi: `X-Scope-Id` zorunluluğu, hata gövdesi şekli
(`{error:{code,message}}`), ve `reserve`'ün önek değil seri **kimliği** istemesi.

⚠️ Kalan: `claim` ucu (§4.5, dışarıda kesilmiş numaranın beyanı) mock'ta
kullanılmıyor. Geliştirici kendi numarasını verdiğinde mimkit defterine beyan
edilmiyor — yalnız mock'un kendi `DUPLICATE_DOCNO` kapısı çalışıyor. **Kullanıcıya
soru:** beyan edilmeli mi? (Sadakat artar, ama kittest defterini mock trafiğiyle
doldurur.)

⚠️ Ölçüm sırasında kittest'te iki deneme serisi açıldı (`mimmock-probe`,
`mimmock-test-local`, `mimmock-e2e-local` kapsamlarında). Silme yapılmadı.

## 19. CI'da sadakat ölçümü — ✅ KAPANDI (2026-09-23)

Doğrulama mimkit'e taşındı (§23). CI'nın `fidelity` işi artık yalnız
`vars.MIMMOCK_MIMKIT_URL` + `secrets.MIMMOCK_MIMKIT_TOKEN` ister; mimkit zaten
sunucuda canlıdır. Değişken tanımlı değilse iş atlanır ve bu görünür.

## 20. Panel kodunun birim testi yok (M9)

Panel tarayıcıda ölçüldü ve altı kusur canlı ekranda yakalandı (`docs/m9-olcum.md`
§2), ama `Flip`, `Axis`, `NextCell`, terim katmanı gibi parçaların testi yok.
Arka uç tarafı kapalı: yeni `GET /v1/_sandbox/clock` ucunun dört testi var ve
iki mutasyonla sınandı.

**Neden şimdilik böyle:** panelin doğruluğu görsel ve davranışsaldır; jsdom'da
split-flap animasyonunu ya da "yatay sayfa kayması yok"u ölçmek sahte yeşil
üretir. Gerçek ölçüm aracı tarayıcıdır ve o ölçüm yapıldı.

**Kullanıcıya soru:** panel için tarayıcı tabanlı bir regresyon (Playwright)
kurulsun mu? Bedeli: CI'da tarayıcı, ve kittest'e erişim gerektiren bir sahne.

## 21. Zincirin GİDEN→GELEN yönü listeye bağlı (M9)

Gelen bir belgeden gönderenin tahtasındaki aslına gitmek **her zaman** çalışır
(bağ belgenin kendi `sourceDocumentId` alanındadır). Ters yön — giden bir
belgeden alıcının kutusundaki karşılığına gitmek — panelin çektiği gelen kutusu
listesinde arama yapar; karşılık listenin dışındaysa bağlantı görünmez.

**Temiz çözüm:** belge yanıtına karşılık kimliğini eklemek (sunucuda tek sorgu).
M9'un kapsamını genişletmemek için yapılmadı.

## 22. Trafik üreteci tahtayı dolduruyor (M9)

Varsayılan ayarla (120 sn'de 1 belge) sorun değil; ölçüm için 8 sn'ye çekildiğinde
gelen kutusu bir saatte 100 satırı aştı. Tahta en yeni 25 satırı gösterir ve
toplamı yazar, ama **eski kayıtların budanması yok**. Uzun süre açık kalan bir
sandbox'ta veritabanı büyümeye devam eder.

**Kullanıcıya soru:** üretilmiş trafik için bir saklama sınırı (ör. son 500 belge)
konsun mu, yoksa `_sandbox/traffic/reset` yeterli mi?

## 23. Dış geliştirici doğrulamaya nasıl erişecek — ✅ KAPANDI (2026-09-23)

Kullanıcı tespiti: MimForge'da doğrulamanın birincil yolu **mimkit**'tir; mock ise
yedek yola bağlanmıştı. Karar: yedek yol tamamen kaldırıldı, **tek dış bağımlılık
mimkit** (doğrulama + numaralama + görüntü). mimkit sunucuda sürekli canlıdır.

Anahtar: kullanıcı kararı — geliştirici **bilgi@mimsoft.com.tr** adresine e-posta
gönderip ister. README, `.env.example`, `llms-full.txt` ve açılış hata mesajı bunu
söyler.

Sözleşme ve canlı ölçüm: `docs/m2-olcum-kittest-sozlesmesi.md` §1.

## 24. Lisans — ✅ KAPANDI (2026-09-23)

Kullanıcı kararı: **Apache-2.0**. Resmî metin `LICENSE`; telif ve marka bildirimi
`NOTICE` (lisans marka hakkı vermez, madde 6). `package.json`, OpenAPI `info.license`
ve imaj etiketi (`org.opencontainers.image.licenses`) aynı değeri taşır. Sürüm 0.1.1.

## 25. CI'da canlı mimkit (M10)

`fidelity` işi için `vars.MIMMOCK_MIMKIT_URL` + `secrets.MIMMOCK_MIMKIT_TOKEN` GitHub'a
girilmedi. **Kullanıcı kararı (2026-09-23): şimdilik beklesin.** Açıldığında: mimkit'te CI'a özel,
düşük hız sınırlı bir anahtar; ardından `gh variable set MIMMOCK_MIMKIT_URL` ve
`gh secret set MIMMOCK_MIMKIT_TOKEN` (`-R mimarge/mimmock`). Fork PR'ları sırrı göremez.
