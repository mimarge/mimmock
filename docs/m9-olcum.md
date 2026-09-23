# M9 — panel: ölçüm kaydı

**Tarih:** 2026-09-23 · **Sunucu:** yerel `pnpm dev`, SQLite, port 8088
**mimkit:** bağlı (doğrulama + numaralama)

Bu faz planın §8'ini ve K17'sini (impeccable tasarım döngüsü) karşılar. Panelin
tek işi vardır: bir simülasyonu okunabilir kılmak. Ölçüt üç sorudur —
*ne oldu · neden oldu · şimdi ne olacak.*

---

## 1. Yapılan

### 1a. Arka uç eklentileri (panelin veri kaynağı)

| Ne | Nerede | Neden |
|---|---|---|
| Ham istek günlüğü | `server/src/observability.ts` | plan §8'in 🔑 maddesi: *geliştirici ne gönderdi, biz ne döndük* |
| Belge olay geçmişi | aynı dosya | "neden oldu": kural kimliği + ham GİB kodu + alarm + sürüm |
| `GET /v1/_sandbox/clock` | `server/src/routes/sandbox.ts` | panel iki saati yan yana gösterir; sapmayı POST ederek öğrenmek yan etkili olurdu ve günlüğü kirletirdi |
| İki yeni tablo | `server/src/db/spec.ts` | `request_log`, `document_events` |

Gizli başlıklar (`authorization`, `x-panel-token`, `x-mimmock-signature`)
günlükte maskelenir; günlük ucu kendini günlüğe yazmaz.

### 1b. Panel — Uçuş Bilgi Tahtası

Görsel dünya `impeccable` döngüsüyle seçildi. Zar `--scope direction --mode
operate` koşumunda **ASSIGNED INDEX 4**'ü (Matbu Evrak) atadı; karar sayfası
yanıtsız kapandı, yapılandırılmış soruyla yeniden sunuldu ve kullanıcı
**Uçuş Bilgi Tahtası**'nı — benim 1. adayımı, `IMPECCABLE'S PICK` künyeli kartı
— sabitledi. Sabitleme zarı yener.

Yön sözleşmesi: `.impeccable/surfaces/panel.md`.

| Parça | Dosya |
|---|---|
| Kabuk: ray, iki saat, zaman şeridi, sözlük şeridi | `panel/src/App.tsx` |
| GİDEN/GELEN tahtaları, SATIR AÇILIMI, zaman ekseni | `panel/src/boards.tsx` |
| Split-flap hücresi, durum hücresi, terim çıpası | `panel/src/board.tsx` |
| Servis bandı: webhook teslimleri + ham istek günlüğü | `panel/src/service.tsx` |
| Operasyon çekmecesi | `panel/src/ops.tsx` |
| Çizilmiş SVG işaretler | `panel/src/icons.tsx` |
| Terim katmanı | `panel/src/glossary.ts` |
| Dünya | `panel/src/styles.css` |

**Kopya sayısı 0.** Terim katmanı geçiş kurallarının açıklamalarını ve MimForge
atıflarını yeniden yazmaz; `@shared/engine/transitions`ten okur. Ölçüm
iyileşirse sözlük kendiliğinden düzelir.

**Yüzler self-host.** `panel/public/fonts/` — 14 woff2, 233 KB. Her yüz için
**latin ve latin-ext**: Türkçe `ğ ş İ` latin alt kümesinde yoktur; yalnız latin
indirilseydi diakritikler sistem yüzüne düşerdi.

---

## 2. Canlı ölçümler

Aşağıdakilerin hepsi **çalışan sistemde**, gerçek veriyle ölçüldü. Trafik
üreteci 8 saniyede 2 belge üretti; ayrıca beş senaryoda altı giden belge elle
gönderildi (`happy`, `slow`, `gib_stalled`, `receiver_reject`, `gib_error`).

| # | Ölçüm | Sonuç |
|---|---|---|
| Ö1 | Tahta ayağa kalktı, bağımlılık lambası yeşil (2026-09-23'ten beri: mimkit lambası) | ✔ |
| Ö2 | `+16g` atlandı: `slow` tamamlandı, `gib_stalled` **açık kaldı** | ✔ zarf kapanmadı, hataya düşmedi |
| Ö3 | SATIR AÇILIMI olay geçmişini indiriyor | ✔ G6/G7/G9 + `dosya:satır` atfı + kural notu |
| Ö4 | `1220` düğümü eksende vurgulu | ✔ "BİRİNCİL teslim çıpası" |
| Ö5 | Sözlük katmanı: 215 terim çıpası, kapalıyken iz yok | ✔ |
| Ö6 | 390px'te yatay sayfa kayması | ✔ yok (`scrollWidth` 380) |
| Ö7 | Sunucu paketi | ✔ 313/313 (25 dosya; M8'e göre +4 — saat okuma ucu) |
| Ö8 | Saat okuma ucu mutasyonu (2 mutant) | ✔ ikisi de kırmızı, geri alınca yeşil |
| Ö9 | Kontrast: sayfadaki **her** görünür metin düğümü tarandı | ✔ 0 ihlal (WCAG AA) |
| Ö10 | Odak halkası, gerçek Tab turuyla | ✔ 2px tahta sarısı, 2px offset, `:focus-visible` |
| Ö11 | Satır açılımı klavyeyle (Enter) | ✔ açılıyor, `aria-expanded` taşınıyor |

### Canlı ölçümde yakalanan altı kusur

Hiçbiri birim testiyle görünmezdi; hepsi çalışan ekranda bulundu.

1. **GİDEN tahtası gelen belgeleri gösteriyordu.** `/v1/documents` her iki yönü
   döndürür. Trafik üreteci yalnız gelen üretiyor; tahta 12 sahte "giden"
   sıralamıştı. → `?direction=OUTBOUND`.
2. **`SEND_FAILED` kehribar görünüyordu.** "Askıda" bilgisi durum hücresine
   sızmış, durumu boyamıştı. Belgenin durumu `SEND_FAILED`'dır; askıda olması
   SIRADA sütununun sözüdür. Ayrıca `SEND_FAILED` askıda değildir —
   yeniden gönderme yolu AÇIKTIR (kural G15).
3. **16 gün atlayınca sanal saat gerçekle aynı görünüyordu.** Saat yalnız
   `ss:dd:ss` gösteriyordu; atlamanın tamamı GÜN hanesindeydi. → her iki saate
   tarih satırı.
4. **Eksenin dikey çizgisi görünmüyordu.** Konumu doğruydu (ölçüldü: düğüm
   merkeziyle aynı piksel), rengi (`#2a2f37`) canlı ekranda kayboluyordu.
   Kırmızı bir sonda çizginin var olduğunu gösterdi. → `#525c6b`.
5. **Mobilde SAYFA yatay kayıyordu.** Servis bandı grid öğesinin varsayılan
   `min-width: auto`'su, içindeki sabit sütunlu tabloyu izleyip kabı şişiriyordu
   (`scrollWidth` 672 > 390). → `minmax(0, 1fr)` + defter tabloları kendi
   kaydırma kabına alındı.
6. **İki ton AA'nın altındaydı.** Ray künyesi 3.15, defter başlığı 3.09 —
   tahtanın en küçük ama işlevsel metinleri okunmuyordu. Üç sönük kademe
   yeniden ayarlandı (`--dim` ~7.3, `--faint` ~4.6); yeniden tarandı, 0 ihlal.
7. **İlk boyamada 25 satır birden çevriliyordu.** Sayfanın açılması bir haber
   değildir; bu, "çevrilen şey = değişen şey" kuralını aşındırıyordu.
   → kanatçık ancak ikinci kez yazıldığında döner.

### Dedektör

`impeccable detect` bir kez koşturuldu: **146 → 26 bulgu**.

| Bulgu | Karar |
|---|---|
| `dark-glow` — sıfır kaymalı renkli halo | giderildi; sapma parıltıyla değil kehribar taban çizgisiyle anlatılıyor |
| `wide-tracking` — karışık metinde 0.18em | giderildi; o başlıklar versale çevrildi (aralık yalnız kısa versalde meşru) |
| `undersized-ui-text` — 10/10.5px | işlevsel metin tabanı 11px'e çıkarıldı |
| `side-tab` — jenerik renkli sol şerit | uyarı bandı tahtanın kendi ikaz bandına dönüştürüldü |
| `text-overflow` — kesilen hücreler | **kasıtlı**: sabit sütunlu tahtada üç nokta; tam metin `title` ile |
| `em-dash-overuse` (advisory) | bırakıldı; Türkçe metinde tire meşru bir noktalama |

---

## 2b. Bitiriş incelemesi (`impeccable-finish-reviewer`, Opus)

Karar: **düzelt**. Sekiz maddi kusur bildirildi; **sekizi de giderildi**.

| # | Bulgu | Düzeltme |
|---|---|---|
| 1 | Seed anahtarı kayıt dışı | Uydurulmadı. Sözleşmedeki beyan netleştirildi: yeni bir atış YAPILMIŞ atışın kaydı değildir; başka bir atamayla bu boşluğu doldurmak denetlenebilirlik değil sahteciliktir |
| 2 | Craft floor: tahtaya `🔑` emojisi basılıyor | Veri katmanı kendi dilinde kaldı; sunum katmanı vurguyu ayıklayıp **çizilmiş çıpa işaretine** çeviriyor (`stripEmphasis`) |
| 2b | Craft floor: `.err`'de jenerik renkli sol şerit | Tahtanın kendi diline çevrildi (üst şerit) |
| 3 | `--faint` ≈3.0:1, placeholder ≈2.2:1 | Zaten düzeltilmişti (Ö9); placeholder de `--faint`'e alındı |
| 4 | `<tr role="button">` sütun ilişkisini siliyordu | Satır doğal `row` rolüne döndü; açma kumandası ilk hücredeki **gerçek `<button>`** (`aria-expanded` + `aria-controls`). İç içe `Term` düğmeleri de böylece geçerli oldu |
| 5 | `1220` yalnız renkle ayrılıyordu | Çizilmiş çıpa + **BİRİNCİL** sözcüğü; hem HAM sütununda hem eksende |
| 6 | İki paragraf açıklama katlamanın üstünü yiyordu | Tek satırlık ikaz bandı; tam metin AÇIKLAMA katmanına bağlandı. GİDEN başlığı y≈250 → y≈207 |
| 7 | Kanatçık malzemesi eksik (mat gölge, kart yüzü) | Satır altına mat gölge; dönen kanatçığa kendi kart yüzü ve dikişi; ayrıca tahtaya **kasa** ve sütun modül aralıkları |
| 8 | Zincir hedefi açıyor ama kaydırmıyordu; mobilde DURUM/SIRADA ekran dışıydı | `scrollIntoView` eklendi; dar ekranda ikincil kimlik sütunları tahtadan çekilip künyeye alındı, detay hücresi `sticky` ile ekrana sabitlendi |

Ek olarak incelemenin "sığmayan küçükleri" de kapatıldı: gerçek saatteki saniye
hanesi kaldırıldı (tık **yalnız** sanal saatin işaretidir), menteşe oku artık
dönmüyor — yön değiştiriyor (sayfadaki tek dönme çevirmedir), tahta satırı
ağırlığı sözleşmenin dediği 600'e çıkarıldı ve ölçek uzaktan okuma için
büyütüldü (satır 34→36px, gövde 15→16px).

**Dedektör, düzeltmelerden sonra: 146 → 3 bulgu.** Kalan ikisi kısa versal
etiketteki aralık ve tek bir 11.5px gövde metni.

İncelemenin "korunsun" dediği dört şey sulandırılmadı: AÇIKLAMA kapalıyken
`Term`'in hiç iz bırakmaması, kural notunun motordan okunması, `Flip`'in ilk
boyamada çevirmemesi, tarayıcı yüzeylerinin tamamının boyanmış olması.

---

## 2c. Belgeleme (`impeccable-documenter`, Opus)

`DESIGN.md` (kök) ve `.impeccable/design.json` inşadan türetilerek yazıldı —
niyetten değil. 15 renk · 11 tipografi rolü · 16 bileşen token'ı · 14 adlandırılmış
kural (`Never-Color-Alone`, `Measured-Dim`, `Three-Faces`, `Flip-Means-Change`,
`Board-Scrolls-Not-Wraps`, `Reading-Stays-Put`, `Density-First` …).

Belgeleyicinin işaret ettiği üç tutarsızlık:

| Bulgu | Karar |
|---|---|
| Defterdeki teslim durumu yalnız sözcük + renk taşıyordu — `Never-Color-Alone` tahtada tam, defterde eksikti | **Düzeltildi**: defter durumları da çizilmiş işaret aldı (`DeliveryMark`) |
| `.c-no` / `.ledger .mono` içinde `font-family … !important` — özgüllük borcu | **Düzeltildi**: seçici özgüllüğü artırıldı, `!important` kalktı |
| Sözleşme ile inşa arasında üç sapma: `--ink` `#08090b` (sözleşme `#0a0b0d`), `--yellow` `#f5b820` (`#f0b429`), çevirme kademesi 26 ms (28 ms) | **Kod onarılmadı, sapma kayda geçti.** `DESIGN.md` gerçek değerleri kanonlaştırdı; kodu sonradan sözleşmeye uydurmak kanonu yanlışlamak olurdu. Sözleşmeye not düşüldü: bir dahaki sefere değer kopyalansın, yuvarlanmasın |

Belgeleyici tahta kasasının sert ofset gölgesini (`0 3px 0`) **genelleştirmedi**;
sözlükte "yalnız tahta gövdesine ve raya uygulanır, genel bir yükseltme değildir"
diye sınırlandı. Bu doğru karar: dünya neobrutalist değil, o gölge kasa
kalınlığıdır.

---

## 3. Ne ölçülmedi

- **Gerçek bir ikinci ekranda günlerce açık bırakılmadı.** Bellek sızıntısı,
  uzun süreli poll davranışı ve 100+ satırdan sonra tahtanın hâli ölçülmedi.
- **Panel kodunun birim testi yok.** Yeni saat ucunun testi ve mutasyonu var
  (Ö8), ama `Flip`, `Axis`, `NextCell` gibi bileşenler test edilmedi; hepsi
  gözle ve tarayıcıda ölçüldü.
- **Ekran okuyucuyla denenmedi.** Kontrast (Ö9), odak halkası (Ö10) ve klavyeyle
  satır açılımı (Ö11) ölçüldü; renk hiçbir durumun tek taşıyıcısı değil (işaret +
  sözcük + renk). Ama VoiceOver/NVDA ile bir tur yapılmadı: split-flap
  hücrelerinin `sr-only` metni ve `aria-expanded` bildirimi gerçek bir okuyucuda
  doğrulanmadı.
- **`prefers-reduced-motion` yolu yazıldı, denenmedi.**
- **Zincirin GİDEN→GELEN yönü listeye bağlıdır:** karşılık gelen belge gelen
  kutusu listesinde değilse bağlantı görünmez. GELEN→GİDEN yönü her zaman
  çalışır (bağ belgenin kendi alanında).
- **Tarayıcı çeşitliliği yok:** yalnız Chrome'da ölçüldü.
