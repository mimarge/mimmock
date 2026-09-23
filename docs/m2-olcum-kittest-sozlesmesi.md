# M2 ölçümü — kittest sözleşmeleri

**Tarih:** 2026-09-22 (§1 yeniden: 2026-09-23) · Kaynak: MimForge `main`,
`@mimarge/mimkit@0.8.0` (dist), canlı mimkit. Her satırın `dosya:satır` atfı var;
ölçülemeyeni §4'te ayrı.

> **2026-09-23:** Doğrulama mimkit'e taşındı. M2'de mock doğrulamayı ayrı bir
> servise doğrudan soruyordu; MimForge'da o yol yalnız **yedektir**, birincil yol
> mimkit'tir (`packages/ubl-validate/src/index.ts:3-8`). Mock artık yalnız mimkit'e
> bağlıdır. Eski §1 git geçmişindedir.

> Plan K4 mock'u **ağa bağlı** tasarlıyor: şema/şematron, numaratör ve şablon canlı
> gelir. Bu belge o iki dış yüzeyin ölçülmüş HTTP sözleşmesidir.

---

## 0. 🔴 Mock, MimForge'un istemci paketlerini KULLANAMAZ

| Paket | Durum | Sonuç |
|---|---|---|
| `@mimarge/mimkit` (0.8.0) | **npm'de YOK** — `npm view` → 404 | Mock kendi ince HTTP istemcisini yazar |
| `@mimforge/ubl-validate` | MimForge private deposunda | Aynı |
| `json2ubl-ts` | **npm public, 5.0.0** | Doğrudan bağımlılık (plan §2c'yi doğruluyor) |

Plan §2c'nin *"tek bağımlılığı `json2ubl-ts`"* saptaması ölçümle doğrulandı. İki dış
servisin sözleşmesi aşağıda; mock bunları elle konuşur.

## 1. Doğrulama — mimkit `POST /v1/validate` (CANLI ÖLÇÜLDÜ 2026-09-23)

MimForge sözleşmesi: `packages/ubl-validate/src/index.ts` (`createMimkitTransport`,
`fromMimkit`, `:660-870`) ve `packages/mimkit-client/src/index.ts:25-40`.

### İstek

```
POST {MIMKIT_URL}/v1/validate
Authorization: Bearer <MIMKIT_TOKEN>
Content-Type: application/json

{ "xmlBase64": "…", "profile": "unsigned-invoice", "parameters": { "type": "efatura" } }
```

- `X-Scope-Id` doğrulama için **gerekmez** (ölçüldü: başlıksız istek 200).
- `parameters.type` kapalı küme: `efatura · earchive · goruntuleme · eirsaliye ·
  uygulamayaniti`. Küme dışı → `400 PARAMETERS_INVALID` (ölçüldü).
- 🔴 `suppressions` **asla** gönderilmez: MimForge canlıda ölçmüş, doğrulamayı
  tamamen kapatabiliyor (`ubl-validate/src/index.ts:830-840`).

### Yanıt sınıflaması — ÖLÇÜLDÜ

| HTTP | Anlam | Mock karşılığı |
|---|---|---|
| `200` | Doğrulama koştu; gövde **düz nesne** (zarf yok) | gövdeye bak |
| `200` + `valid:false` | Belge geçersiz | `SCHEMA_INVALID` (400) |
| `422 DOCUMENT_REJECTED` | İçerik işlenemedi (XML değil / tür tespit edilemedi) | `MALFORMED_XML` (400) |
| `401 UNAUTHORIZED` · `403` | Anahtar yanlış | `VALIDATOR_UNAVAILABLE` (503) |
| `400 PARAMETERS_INVALID` | İsteği mock yanlış kurdu | `VALIDATOR_UNAVAILABLE` (503) |
| `429` · `5xx` · ağ | Altyapı | `VALIDATOR_UNAVAILABLE` (503) |

🔑 Yalnız `422` belge reddidir. `401`/`400`'ü "belgeniz hatalı" diye göstermek
anahtar ya da istek hatasını müşteri hatası gibi gösterirdi (MimForge aynı ayrımı
yapar: `ubl-validate/src/index.ts:18-30`).

### Gövde ve eşleme

`{ valid, documentType, profileApplied, errors[], schemaVersionId, schemaHash,
schematronVersionId, schematronHash, appliedXsd, appliedSchematron }`;
`errors[]` = `{ severity, source: SCHEMA|SCHEMATRON, code, message, xpath, line }`.

mimkit iki bayrağı tek `valid`e indirir; mock `validSchema`/`validSchematron`'u
`errors[].source`'tan geri kurar. `valid:false` + boş hata listesi → **ikisi de
false** (fail-closed). Alanlar: `code→ruleId`, `xpath→test` (MimForge `fromMimkit`
ile aynı).

### Canlı ölçüm (fixture `EFATURA-01-temel-satis.xml`)

| Girdi | Sonuç |
|---|---|
| imzasız profil (`unsigned-invoice`) | `200 valid=true`, `UBL-Invoice-2.1.xsd`, `UBLTR_MAIN`, `profileApplied=unsigned-invoice` |
| tam profil (imza bekler) | `200 valid=false`, 1 hata, `source=SCHEMA` |
| XML olmayan metin | `422 DOCUMENT_REJECTED` |
| yanlış anahtar | `401 UNAUTHORIZED` |
| geçersiz `type` | `400 PARAMETERS_INVALID` |
| süre | 36–66 ms (ilk istek 236 ms) |

**Hazırlık sondası:** mimkit `/healthz` anahtar denetlemez. Mock açılışta XML
olmayan bir gövdeyle `/v1/validate` çağırır: `422` = erişildi **ve** anahtar
geçerli; `401/403` = anahtar reddedildi (ayrı mesaj).

**Sadakat:** 15 fixture'lık sadakat testi (`fidelity.live.test.ts`) ve bütün canlı
paket yalnız mimkit ile koştu ve geçti.

## 2. Numaratör (mimkit)

**SDK:** `@mimarge/mimkit@0.8.0` → `dist/numbers.js`, `dist/core.js`.

```
POST {baseUrl}/v1/numbers/reserve
başlıklar:
  authorization: Bearer <apiKey>
  x-request-id: <korelasyon>
  accept: application/json
  x-owner-tax-id: <mükellef VKN>        ← kiracı; bu uçta ZORUNLU
  x-scope-id: <kapsam>                  ← yalnız verilmişse
  x-client-ref: <istemci>               ← yalnız verilmişse
  idempotency-key: <anahtar>            ← ZORUNLU
gövde: { date: "YYYY-MM-DD", seriesId?: string, docType?: DocType }
```

Kaynak: `dist/numbers.js` (`reserve`, uç yolu + `tenant:'zorunlu'`) ·
`dist/core.js:57-85` (başlıklar).

| Kural | Kaynak |
|---|---|
| 🔴 `idempotency-key` **tip düzeyinde zorunlu** — önerilen değer belgenin `cbc:UUID`si (ETTN) | `numbers.js` reserve notu |
| 🔴 Yeniden denemede anahtar **DEĞİŞMEZ** — yeni anahtar mükerrer numara üretir | aynı |
| Protokol **tek fazlı**: `commit` ucu YOK, rezervasyon kalıcı, süre dolumu yok | `numbers.js` başlık notu |
| `seriesId` yoksa (uygulama, mükellef, scope, tür) varsayılanı çözülür | `types.d.ts:143` |
| HTTP `200` → `replayed: true` (aynı anahtarla tekrar) | `numbers.js` reserve |
| `claim` (§4.5) dışarıda kesilmiş numaranın beyanı — idempotans doğal anahtarla | `numbers.js` claim notu |

Yanıt: `Reservation { reservationId, number, series: { id, prefix, … } }` (`types.d.ts:147`).

## 3. Env adları — MimForge'dan ölçüldü, mock aynı deseni kullanır

Kullanıcı kararı (2026-09-22): *"MimForge env adlarını ölçüp aynısını kullan; değerler sizde."*

| MimForge (ölçülen, kullanım sayısı) | MimMock karşılığı |
|---|---|
| `MIMKIT_URL` (4) | `MIMMOCK_MIMKIT_URL` |
| `MIMKIT_TOKEN` (4) | `MIMMOCK_MIMKIT_TOKEN` |
| `MIMKIT_SCOPE_ID` (1) | `MIMMOCK_MIMKIT_SCOPE_ID` |
| `MIMKIT_OWNER_TAX_ID` (1) | **yok** — mock'ta mükellefin VKN'si çağrı başına verilir |

## 4. Ölçülemeyenler

| Konu | Neden |
|---|---|
| Numaratörün **canlı** davranışı | `kittest.mimforge` adresi/anahtarı bu oturumda yok. İstemci ölçülmüş sözleşmeye göre yazıldı ama **canlı çağrı yapılmadı** — "ölçüldü" denemez |
| mimkit hata kodlarının tam kümesi | SDK `errors.js` sınıfları var; HTTP kod ↔ iş kodu eşlemesi canlı sonda ister |
| `x-scope-id` gerekliliği | Kurulum bağımlı (`SCOPE_NOT_ALLOWED` kapısı `core.js:72-76`'da anılıyor) |
