# M9b — geliştirici belgeleri ve tek bağımlılık: mimkit

**Tarih:** 2026-09-23 · İki iş: (1) kurulum/işletim belgesi, etkileşimli API
referansı ve LLM kılavuzu; (2) doğrulamanın mimkit'e taşınması — MimMock'un tek
dış bağımlılığı artık mimkit.

---

## 1. Belge yüzeyi

| Yüzey | Nerede | Kaynak |
|---|---|---|
| Etkileşimli API referansı | `/docs` (Scalar) | `/openapi.json`'dan canlı |
| OpenAPI 3.1 | `/openapi.json` · `docs/openapi.json` | `server/src/docs/openapi.ts` |
| LLM dizini / tam kılavuz | `/llms.txt` · `/llms-full.txt` · depo kökü | `server/src/docs/llms.ts` + `content/guide.md` |
| Depoda çalışan ajan | `AGENTS.md` (+ `CLAUDE.md`) | elle |
| Kurulum ve işletim | `README.md` · `scripts/mimmock` · `.env.example` · compose | elle |

**Kopya yok.** Durumlar, geçiş tablosu, senaryolar, hata kataloğu, yeniden gönderme
sınıfları, webhook olayları ve uç listesi belgelerde elle yazılmadı; sunucunun
sabitlerinden üretiliyor. Durum açıklamaları panelden `server/src/status.ts`'e
taşındı; panel ve LLM kılavuzu aynı kaynaktan okuyor. Depodaki kopyaların
tazeliğini CI ölçüyor (`docs:check`).

### Ölçümler

| # | Ölçüm | Sonuç |
|---|---|---|
| B1 | Rota eşliği — sunucudaki her uç belgede, belgedeki her uç sunucuda | ✔ iki yönlü |
| B2 | Belgenin kendisi geçerli OpenAPI 3.1 (`@scalar/openapi-parser`) | ✔ |
| B3 | Gerçek yanıtlar şemaya uyuyor — iki yönlü (fazla alan da, eksik alan da kırmızı) | ✔ ağsız 20 + canlı 7 senaryo |
| B4 | Belgedeki **örnek gövde** gerçekten 202 alıyor; `required` dediği 5 alanın her biri eksikken gerçekten 400 | ✔ |
| B5 | `/docs` dışarı konuşmuyor: betik yerelden (4.3 MB), font sunucusu / telemetri / MCP kapalı | ✔ gömülü yapılandırma ayrıştırılarak |
| B6 | `openapi-typescript` tip üretimi | ✔ 2.600 satır; üretilen `Document['status']` `'FAILED'`'ı derleme hatasıyla reddediyor |
| B7 | Container: sıfırdan "hazır"a (katman önbelleğiyle) | ~35 sn |
| B8 | Yedek → sıfırla → geri yükle gidiş-dönüşü | ✔ belge sayısı korundu |
| B9 | `--pg` katmanı | ✔ `dialect: pg`, `pg_dump` yedeği |
| B10 | Çevrimdışı kip | ✔ yönetim 200, belge gönderme 503, `/healthz` 503 |

### Mutasyon bataryası — belge kapıları

| Mutasyon | Sonuç |
|---|---|
| D1 belgeden bir uç sil | 🔴 |
| D2 `Document` şemasından alan sil | 🔴 |
| D3 hata kodu listesini elle kıs | 🔴 |
| D4 `Link` başlığını kaldır | 🔴 |
| D5 Scalar CDN fontunu aç | ⚪ **SAĞIR** → test HTML'e bakıyordu; karar gömülü yapılandırmada. Düzeltildi → 🔴 |
| D5b telemetriyi aç | 🔴 |
| D6 kılavuza tanımsız yer tutucu | 🔴 |
| D7 `servers` adresini sabitle | 🔴 |

### Ölçümün yakaladığı, belgeye yanlış girecek olan şeyler

1. **`1150` B sınıfıdır.** Kılavuza "gib_error → resend" tarifi yazılmıştı; canlı test
   `409 NEEDS_RESIGN` döndü. Tarif ve sınıf tablosu (üretilmiş) düzeltildi.
2. **JSON yolunda `uuid` zorunlu.** Belge "verilmezse üretilir" diyordu ve `/docs`
   örneğinde `uuid` yoktu — "Try it" ile ilk istek düşecekti.
3. **`/fail` yanıtında `note` yalnız geçiş uygulanmadığında gelir.** Şema zorunlu
   diyordu; test o dala sokulunca kırmızı oldu.
4. **`AWAITING_NUMBERING` mock'ta kalıcı yazılmıyor** (numara alım sırasında satır
   içinde alınıyor). "Mock üretiyor: evet" yazılmıştı.
5. **Boş gövde + `content-type: application/json` 400 alıyordu** — panelin kendi
   istemcisi dahil. Artık `{}` sayılır; bozuk JSON hâlâ reddedilir.
6. README'de ölçülmemiş üç iddia çıkarıldı (depo henüz public değil; önbelleksiz
   derleme süresi; Java isteyen istemci üreticisi — "ölçülmedi" diye işaretli).

---

## 2. Tek bağımlılık: mimkit

Kullanıcı tespiti: MimForge'da doğrulamanın birincil yolu mimkit'tir
(`packages/ubl-validate/src/index.ts:3-8`); mock ise yedek yola bağlanmıştı.
Karar: yedek yol **tamamen** kaldırıldı — kod, test, belge, yorum; adı depoda
geçmiyor ve bunu CI tarıyor (`kapi 1b`). Anahtar talebi: **bilgi@mimsoft.com.tr**.

Sözleşme ve canlı ölçüm: `docs/m2-olcum-kittest-sozlesmesi.md` §1.

**Dikiş:** bütün doğrulama tek `Validator` arayüzünden geçiyordu; `ingest.ts`,
`traffic/generator.ts` ve `server.ts`'e **dokunulmadı**. Değişen: istemci
(`kittest/validate.ts`), açılış kapısı (`kittest/index.ts`), yapılandırma,
`/healthz` şeması (`mimkit: { url, ready, offlineAllowed }`).

**Hazırlık sondası:** mimkit `/healthz` anahtar denetlemez; açılış XML olmayan bir
gövdeyle `/v1/validate` çağırır — `422` = erişildi **ve** anahtar geçerli. Böylece
"anahtar reddedildi" ile "erişilemedi" ayrı söylenir.

| # | Ölçüm | Sonuç |
|---|---|---|
| K1 | Tam paket YALNIZ mimkit ile (15 fixture'lık sadakat, imza gidiş-dönüşü, trafik dahil) | ✔ 346/346 |
| K2 | Ağsız paket | ✔ 195/195 |
| K3 | Container: gönderim → `DELIVERED`, doğrulama `UBL-Invoice-2.1.xsd`/`UBLTR_MAIN`, PDF 200 | ✔ |
| K4 | Yanlış anahtar: `doctor` sebebi + e-posta; sunucu kalkmaz, günlükte "anahtar reddedildi (401)" | ✔ |
| K5 | Depoda adın izi (CI kapısıyla aynı tarama) | ✔ 0 |

### Mutasyon bataryası — mimkit doğrulayıcısı

| Mutasyon | Sonuç |
|---|---|
| V1 `422`'yi altyapı say | 🔴 |
| V2 fail-closed'ı kaldır (`valid:false` + boş liste → geçti) | 🔴 |
| V3 `SCHEMA`/`SCHEMATRON` eşlemesini ters çevir | 🔴 |
| V4 hazırlıkta `422`'yi hazır sayma | 🔴 |
| V5 `suppressions` alanını gönder | 🔴 |
| V6 `xpath→test` eşlemesini kopar | 🔴 |
| V7 küme dışı `type` ipucunu gönder | 🔴 |

### Geçişin yakaladığı iki eski hata

1. `routes/companies.test.ts` "ağsız" sayılıyordu ama `status: ok` bekliyordu —
   eski varsayılan adreste bu makinede çalışan yerel bir servis yüzünden geçiyordu.
   Temiz bir CI makinesinde düşerdi. Beklenti artık sondanın kendi sonucundan.
2. `config.ts` bayrakları (`MIMMOCK_ALLOW_OFFLINE`, `_SEED`, `_TRAFFIC_ENABLED`,
   `_DB_AUTO_RESET`) verilen ortam yerine hep `process.env`'den okuyordu. Düzeltildi,
   testi var.

---

## 3. Ne ölçülmedi

- **Önbelleksiz ilk container derlemesi** (bağımlılık indirme ağa bağlı).
- **`/docs` ekran okuyucuyla** ve farklı tarayıcılarda.
- **Windows:** yardımcı betik bash'tir; README düz compose yolunu gösterir, Windows'ta
  denenmedi.
- **mimkit hız sınırı altında davranış** (`429`): sınıflaması birim testte var,
  canlıda tetiklenmedi.
- **mimkit geçici düşüşünden kendiliğinden toparlanma** (`restart: unless-stopped`
  döngüsü): yanlış anahtarla döngü gözlendi, "mimkit geri geldi" hâli canlıda
  sınanmadı.
- Git geçmişi eski doğrulama yolunun adını hâlâ taşıyor; depo M10'da public açılırken
  geçmişin temiz başlatılıp başlatılmayacağı kullanıcı kararıdır.
