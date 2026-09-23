# M5 ölçümü — gelen belge

**Tarih:** 2026-09-22 · **Plan:** §9/M5, K7 · **Sözlük:** §3.2, §3.3, §9-6

> Plan M5'in ölçüsü iki cümledir:
> *"A→B tam döngü; B tanımsızsa e-Arşiv yoluna düşer."* ve
> *"teyit gelmeden yanıt denenince `DOCUMENT_NOT_SETTLED` — tek adımlı gelen kutusu
> bu kapıyı hiç öğretmez."*

---

## 1. 🔑 İKİ ADIMLI akış — bu fazın omurgası

```
GİB push / şirketler-arası teslim / _sandbox enjeksiyonu
            │
            ▼
      ┌───────────┐   sr_send (L10)    ┌───────────┐  sr_confirm 1200|1300 (L11)  ┌───────────┐
      │ RECEIVED  │ ─────────────────► │ RECEIVED  │ ───────────────────────────► │ DELIVERED │
      │ zarf alındı│  S_APR gönderildi │ +sr_sent_at│   verdiğimiz S_APR TEYİTLENDİ │ alım kapandı│
      └───────────┘                    └───────────┘                              └───────────┘
            │                                                                           │
            └────────────── ticari yanıt DENENİRSE → 409 DOCUMENT_NOT_SETTLED ──────────┘
                                                                          yanıt AÇILIR ▲
```

Sözlük §9-6 uyarısı birebir uygulandı: *"Tek adımlı bir gelen kutusu, ticari yanıt
kapısını (`DOCUMENT_NOT_SETTLED`) hiç öğretmez."*

⚠️ **Kod anlamı yön bağımlıdır:** `1200` GİDEN yolda ara eşiktir (`SENT_TO_GIB`),
GELEN yolda **teyit**tir. İki düzlemi karıştıran bir motor gelen belgeyi hiç kapatmaz.
Bunu sınayan mutasyon (`SR_CONFIRM_CODES = [1220]`) **5 testi** kırmızıya döndürüyor.

## 2. Gelen belge üç yoldan doğar (K7)

| Yol | Nasıl | Durum |
|---|---|---|
| **(a)** A→B şirketler-arası | Giden belge `1220` ile teslim olunca alıcı TANIMLIYSA gelen kutusuna düşer | ✅ |
| **(b)** Panelden elle | Panel `_sandbox` ucunu kullanır | ✅ |
| **(c)** `POST /v1/_sandbox/inbox` | Ham XML — *"otomatik test için ŞART"* | ✅ |

🔑 (a) mock'un en öğretici özelliğidir: **tek geliştirici iki tarafı da sınar.**

## 3. Çalışan sistem ölçümleri

### 3a. A → B tam döngü

```
A (1111111111) TICARIFATURA keser → 202
  … 25 sn (motor)

B (2222222222) gelen kutusu:
  ORN2026000000501  gönderen=1111111111  durum=RECEIVED
                    S_APR=gönderildi     yanıt=AWAITING
                    yanıtlanabilir={can: false, reason: DOCUMENT_NOT_SETTLED}
  … teyit geldi
  durum=DELIVERED   S_APR teyit=1200     yanıtlanabilir={can: true}
  → ticari kabul → REPLY_IN_PROGRESS → 1300 → ACCEPTED
  → belge durumu DEĞİŞMEDİ (DELIVERED) — yanıt AYRI eksen
```

### 3b. 🔴 `DOCUMENT_NOT_SETTLED` — teyidin hiç gelmediği hâl

`_sandbox/inbox` + `X-Scenario: inbound_sr_stalled` (K7c):

```
ilk adım: RECEIVED · yanıt: AWAITING
20 sn sonra: durum=RECEIVED  S_APR gönderildi=True  teyit=None
yanıt denemesi → HTTP 409 DOCUMENT_NOT_SETTLED
  "Belge henüz uçtan uca tamamlanmadı: sistem yanıtı (S_APR) GİB'de teyitlenmedi."
```

Bu, sözlük §5/H8'in birebir karşılığıdır: *"Gelen belge `RECEIVED` — S_APR teyit
edilemiyor → o zamana dek YANITLANAMAZ."*

### 3c. B tanımsızsa

Tanımsız alıcıya e-Fatura **ingest'te** reddedilir:
`400 RECEIVER_NOT_REGISTERED — "Alıcı 7777777777 e-Fatura sicilinde yok — belge
e-Arşiv olmalı."` Gelen kutusu hiç oluşmaz; doğru davranış budur.

## 4. Ticari yanıt kapıları (sözlük §4.4)

Sıra normatiftir: **tip → uçtan uca tamamlanma → yanıt durumu → süre.**

| Kapı | Kod |
|---|---|
| Yalnız GELEN `TICARIFATURA` | 409 `NOT_COMMERCIAL` |
| 🔑 Belge `DELIVERED` değil | 409 `DOCUMENT_NOT_SETTLED` |
| Yanıt hattı açık | 409 `REPLY_IN_PROGRESS` |
| Zaten yanıtlanmış | 409 `ALREADY_REPLIED` |
| 8 gün doldu (TTK md.21) | 409 `REPLY_WINDOW_EXPIRED` |
| Gerekçesiz ret | 400 `EMPTY_REJECT_REASON` |

Yanıt kavramının doğum kuralı ölçüldü (`inbound-envelope-activities.ts:457-463`):
`TICARIFATURA` ve her e-İrsaliye → `AWAITING`, diğerleri → `NONE`.

**Panel kapının SEBEBİNİ gösterir:** her gelen belgede `replyable: {can, reason}`
alanı var; geliştirici yanıtlamayı denemeden önce neden yapamayacağını görür.

## 5. 🔴 Bu turda yakalanan üç hata

| # | Hata | Nasıl bulundu |
|---|---|---|
| 1 | **ETTN tekilliği yönsüzdü** (`tenantId+ettn`). A'nın kestiği fatura B'nin kutusuna aynı ETTN'le düşer; yönsüz kısıt K7a döngüsünü **imkânsız** kılıyordu | A→B testi hiç kopya üretmedi |
| 2 | `onDelivered` kancası motora **hiç bağlanmamıştı** — tip tanımı vardı, çağrı yoktu | Aynı test; grep ile doğrulandı |
| 3 | **Test kendi kapısını tetiklemiyordu**: "iki kopya oluşmaz" testi ikinci teslim damgasını hiç üretmiyordu, mutasyon "SAĞIR" dedi ve haklıydı | Mutasyon bataryası |

Üçüncüsü ikinci kez oluyor (M3'te CAS guard'ında da olmuştu): **bir testin yeşil
olması, sınadığını sandığı şeyi sınadığı anlamına gelmiyor.** Mutasyon bunu
yakalayan tek araç.

## 6. Test durumu

```
çevrimdışı 176 test
canlı      113 test
toplam     289 test
```

### Mutasyon — M5'te eklenen 7 kapı, 7'si de kırıldı

| Mutasyon | Sonuç |
|---|---|
| 🔑 Gelen belgeyi doğar doğmaz `DELIVERED` yap (tek adım) | **3 kırmızı** |
| `DOCUMENT_NOT_SETTLED` kapısını kaldır | 1 kırmızı |
| SR teyit kodlarına giden-yol anlamı ver (`1220`) | **5 kırmızı** |
| Yanıt doğum kuralını gevşet (hepsi `AWAITING`) | 1 kırmızı |
| 8 günlük pencereyi kaldır | 1 kırmızı |
| Şirketler-arası teslimi kapat (K7a) | **5 kırmızı** |
| Gelen kopya tekilliğini kaldır | 1 kırmızı |

**Toplam mutasyonla sınanan kapı: 37.**

## 7. M5'te ÖLÇÜLMEYENLER

| Konu | Neden |
|---|---|
| **Karine kabul** (`DEEMED_ACCEPTED`, Y9) | 8/7 gün dolunca otomatik kabul. Tabloda yeri var, süpürücü yazılmadı — `_sandbox/clock` ile tetiklenecek bir sweep gerekir |
| **Gelen zarf karantinası** (`QUARANTINED`, L2–L5) | Zarf düzlemi mock'ta yok; belge düzlemi yürüyor |
| **e-İrsaliye yanıtı** (`PARTIAL`, 7 gün) | v1 kapsamı dışı (plan K2) |
| **`statusNudge` köprüsü** (L13) | Giden workflow'a sinyal; mock'ta Temporal yok |
| **Zarf düzlemi** (`NOT_COMPLETED`/`PROCESSED`/`FAILED`) | Sözlük §3.2'nin ikinci ekseni; mock belge düzlemini yürütüyor |
