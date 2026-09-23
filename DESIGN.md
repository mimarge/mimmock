---
name: MimMock Paneli
description: Bir e-Fatura simülasyonunun akan hâlini Solari split-flap tahtası olarak okutan yoğun durum tahtası.
colors:
  ink: "#08090b"
  board: "#0d0f12"
  flap: "#15181d"
  flap-hi: "#20242b"
  hinge: "#000000"
  edge: "#2a2f37"
  edge-soft: "#1b1f25"
  text: "#ece9e2"
  dim: "#9a9ca2"
  faint: "#7b818b"
  yellow: "#f5b820"
  green: "#3fc47f"
  amber: "#f0a02c"
  red: "#f4676c"
  slate: "#9aa6c2"
typography:
  wordmark:
    fontFamily: "Board, Barlow Condensed, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.2em"
  clock-face:
    fontFamily: "Data, IBM Plex Mono, ui-monospace, monospace"
    fontSize: "26px"
    fontWeight: 500
    lineHeight: 1.05
    letterSpacing: "0.01em"
    fontFeature: "tabular-nums"
  board-title:
    fontFamily: "Board, Barlow Condensed, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 600
    letterSpacing: "0.26em"
  board-row:
    fontFamily: "Board, Barlow Condensed, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    letterSpacing: "0.03em"
  board-status:
    fontFamily: "Board, Barlow Condensed, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    letterSpacing: "0.08em"
  column-head:
    fontFamily: "Board, Barlow Condensed, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.16em"
  label:
    fontFamily: "Board, Barlow Condensed, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.14em"
  body:
    fontFamily: "Note, Barlow, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tabular-nums"
  note:
    fontFamily: "Note, Barlow, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.45
  data:
    fontFamily: "Data, IBM Plex Mono, ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 400
    fontFeature: "tabular-nums"
  data-small:
    fontFamily: "Data, IBM Plex Mono, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 400
    fontFeature: "tabular-nums"
rounded:
  none: "0"
spacing:
  hair: "1px"
  xs: "3px"
  sm: "6px"
  md: "10px"
  gut: "16px"
  lg: "22px"
  xl: "40px"
  row-h: "36px"
components:
  board-row:
    backgroundColor: "{colors.flap}"
    textColor: "{colors.text}"
    typography: "{typography.board-row}"
    rounded: "{rounded.none}"
    padding: "0 10px"
    height: "{spacing.row-h}"
  board-row-hover:
    backgroundColor: "#1b1f26"
  board-row-open:
    backgroundColor: "#1e232b"
  board-column-head:
    backgroundColor: "#12161d"
    textColor: "{colors.yellow}"
    typography: "{typography.column-head}"
    rounded: "{rounded.none}"
    padding: "7px 10px"
  button-primary:
    backgroundColor: "{colors.yellow}"
    textColor: "#000000"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "9px 18px"
  button-primary-disabled:
    backgroundColor: "{colors.edge}"
    textColor: "{colors.dim}"
  button-flap:
    backgroundColor: "{colors.flap}"
    textColor: "{colors.text}"
    typography: "{typography.column-head}"
    rounded: "{rounded.none}"
    padding: "6px 11px"
  button-flap-hover:
    backgroundColor: "#1c2027"
  button-flap-on:
    backgroundColor: "{colors.yellow}"
    textColor: "#000000"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.dim}"
    typography: "{typography.data-small}"
    rounded: "{rounded.none}"
    padding: "2px 8px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.dim}"
    typography: "{typography.data-small}"
    rounded: "{rounded.none}"
    padding: "4px 8px"
  chip-on:
    backgroundColor: "{colors.yellow}"
    textColor: "#000000"
  input-field:
    backgroundColor: "#101318"
    textColor: "{colors.text}"
    typography: "{typography.data}"
    rounded: "{rounded.none}"
    padding: "7px 8px"
  ledger-row:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    typography: "{typography.note}"
    rounded: "{rounded.none}"
    padding: "4px 9px"
    height: "26px"
  drawer:
    backgroundColor: "#0b0d11"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    padding: "16px"
    width: "min(580px, 94vw)"
  detail-expand:
    backgroundColor: "#0b0d11"
    textColor: "{colors.text}"
    rounded: "{rounded.none}"
    padding: "16px 14px 20px 30px"
---

# Design System: MimMock Paneli

## Overview

**Creative North Star: "Uçuş Bilgi Tahtası"**

Bu sistem bir gösterge paneli değil, bir **durum tahtasıdır**. Havaalanı
salonundaki Solari split-flap tahtası gibi davranır: mürekkep siyahı bir gövde,
bir ton açık kanatçık satırları, her satırın üstünde saç teli kalınlığında bir
menteşe çizgisi ve altında mat bir gölge. Bilgi kartlara bölünmez, kahraman
metriğe indirgenmez; tek bir ortak zaman ekseninde dizilmiş, sabit yükseklikli
satırlar hâlinde okunur. Reddedilen kategori düzeni açıkça kayıtlıdır: eşit
boyutlu kart ızgarası ve kahraman sayı.

Yoğunluk bu sistemin varsayılanıdır. Panel ikinci ekranda sürekli açık durur;
göz ucuyla okunur, üstüne eğilinmez. Satır yüksekliği 36px'te sabitlenmiştir,
sütunlar piksel genişliğinde çivilidir, sayı sütunları `tabular-nums` ile
hizalanır. Açıklama katmanı yoğunluğa müdahale etmez: talep üzerine gelir ve
kapalıyken sayfada **hiçbir iz bırakmaz**.

Malzeme süs değildir. Tahtanın kasası (kenar + alt kalınlık + iç vurgu) ve
kanatçığın kendi yüzü (üst menteşe + alt mat gölge) bu dünyanın taşıyıcı
kararlarıdır; onları kaldırdığınızda geriye koyu bir HTML tablosu kalır. Aynı
şekilde hareket de tek bir gramerdir: çevirme, ve yalnız değişimde.

**Key Characteristics:**
- Mürekkep siyahı zeminde tahta sarısı sütun bandı; sıcak kireç beyazı metin.
- Üç yüz, üç iş: tahta (Barlow Condensed), ölçülen sayı (IBM Plex Mono), açıklama (Barlow).
- Sıfır yuvarlaklık: her köşe dik, her kenar 1px hattır.
- Tek hareket grameri: split-flap çevirme, yalnız bir değer değiştiğinde.
- Renk hiçbir bilginin tek taşıyıcısı değil — işaret + sözcük + renk birlikte.
- Yoğunluk varsayılan, açıklama talep üzerine.

## Colors

Palet, zayıf ışıklı bir salonda uzaktan okunan bir tahtanın paletidir: dört
kademe siyah-gri gövde, tek bir sıcak sarı vurgu, üç durum rengi ve ölçülmüş üç
sönük metin kademesi.

### Primary
- **Tahta Sarısı** (`--yellow`): sütun bandının rengi. Sütun başlıkları, açık
  satırın sol çıtası, satır açılımının sol kenarı, sanal saat, `::selection`,
  caret, `:focus-visible` halkası, birincil düğme zemini ve seçili chip.
  Sarı üzerine metin daima saf siyah (`#000`) yazılır — asla `--text` değil.

### Secondary
- **Tahta Yeşili** (`--green`): teslim/başarı. Bağlantı lambası yanık hâli,
  `1220` çıpası, teslim edilmiş webhook.
- **Kehribar** (`--amber`): askı, bekleme, sapma. Askıdaki belge, teyit
  beklenen gönderim, sanal saatin kaymış olduğunu söyleyen taban çizgisi ve
  uyarı bandının üst kenarı.
- **Tahta Kırmızısı** (`--red`): hata ve ölü teslimat. Hata bandı, alarm künyesi,
  sönük bağlantı lambası.

### Tertiary
- **Arşiv Mavisi** (`--slate` / `#9aa6c2`): kapanmış-raporlanmış kayıtlar,
  senaryo künyesi ve zincir düğmesi. Aktif olmayan ama tamamlanmış hâlin rengi;
  yeşille karışmaması için soğuk tutulur.

### Neutral
- **Mürekkep** (`--ink`): sayfa zemini ve tarayıcı `theme-color`'ı.
- **Tahta Gövdesi** (`--board`): tahtanın kendi zemini, zaman şeridi, satır
  açılımının kabı.
- **Kanatçık** (`--flap`): satır yüzeyi ve tahtanın kendi dilindeki düğmeler.
- **Kanatçık Vurgusu** (`--flap-hi`): menteşenin üst saç teli; çevrilen kartın yüzü.
- **Menteşe Siyahı** (`--hinge`): satır ayıran ve bant ayıran tam siyah hat.
- **Kenar** (`--edge`) ve **Yumuşak Kenar** (`--edge-soft`): düğme/alan
  çerçeveleri ile servis bandının daha sessiz çizgileri.
- **Kireç Beyazı** (`--text`), **Sönük** (`--dim`), **Soluk** (`--faint`): üç
  metin kademesi.

### Named Rules

**The Never-Color-Alone Rule.** Renk hiçbir durumun tek taşıyıcısı değildir.
Tahtadaki her durum üç katmanla gelir: çizilmiş işaret + sözcük + renk. `1220`
teslimi ayrıca çıpa işareti ve BİRİNCİL sözcüğünü taşır. Yeni bir durum
eklerken üçünü birden getirin; ikisi yetmez.

**The Measured-Dim Rule.** Üç sönük kademe tarayıcıda ölçülmüş kontrastla
seçildi: `--text` ~15.5:1, `--dim` ~7.3:1, `--faint` ~4.6:1 — hepsi WCAG AA
(4.5:1) üstünde. `--faint` tabanın kendisidir; daha sönük bir dördüncü kademe
icat etmeyin. (Önceki `#5c6066` ray künyesinde 3.15 veriyordu ve düzeltildi.)

**The Yellow-Is-The-Board Rule.** Sarı tahtanın sütun bandıdır, genel bir vurgu
boyası değil. Sütun başlığı, odak, seçim, sanal zaman ve tek bir birincil eylem
dışında sarı kullanılmaz.

## Typography

**Display/Board Font:** Barlow Condensed (`--board-font`, 500/600)
**Body Font:** Barlow (`--note-font`, 400/500/600)
**Data/Mono Font:** IBM Plex Mono (`--data-font`, 400/500)

Hepsi kendi kopyamızdan sunulur (`panel/public/fonts/`), latin **ve** latin-ext
alt kümeleriyle: `ğ ş İ` latin alt kümesinde yoktur, Türkçe diakritikler şarttır.
İki taşıyıcı yüz (`barlow-condensed-600`, `plex-mono-400`) `index.html`'de
preload edilir; sistem yüzüne düşüş görünmez.

**Character:** Sıkıştırılmış versal tahtanın uzaktan okunan sesidir; monospace
ölçülen her şeyin sesidir; Barlow yalnız insanın açıkladığı yerde konuşur.
Üçü hiçbir zaman aynı işi paylaşmaz.

### Hierarchy
- **Wordmark** (Board 600, 22px, `0.2em`): ray künyesi — MIMMOCK.
- **Clock Face** (Data 500, 26px / dar ekranda 21px): gerçek ve sanal saat;
  saniye hanesi 15px ikincil kademede.
- **Board Title** (Board 600, 19px, `0.26em`): GİDEN / GELEN tahta başlıkları.
- **Board Row** (Board 600, 16px, `0.03em`): tahta satırının kendisi.
- **Status** (Board 600, 15px, `0.08em`): durum hücresi, işaretiyle birlikte.
- **Column Head** (Board 600, 11px, `0.16em`, versal): sütun bandı ve tahtanın
  dilindeki düğmeler (11.5px).
- **Label** (Board 600, 11px, `0.14em`, versal): künye etiketleri, form alan
  adları, `legend`, defter başlıkları (`0.2em`).
- **Body** (Note 400, 14px/1.45): sayfanın taban metni.
- **Note** (Note 400, 12.5–13px): açıklama katmanı, sözlük gövdesi, düğüm notu.
- **Data** (Data 400/500, 11–13px): belge no, VKN, ham GİB kodu, saat, ETTN,
  tutar, kural kimliği, defter hücreleri.

### Named Rules

**The Three-Faces Rule.** Üç yüz, üç iş. Tahta satırı ve versal etiketler
`--board-font`; **ölçülen her sayı** (belge no, ham GİB kodu, saat, ETTN, tutar,
dizi numarası) `--data-font`; açıklama katmanı `--note-font`. Bir sayı Barlow'la
dizildiyse yanlıştır.

**The Wide-Tracking-Only-For-Caps Rule.** `0.1em` üstü harf aralığı YALNIZ kısa
versal etikette meşrudur. Karışık büyük-küçük metinde geniş aralık okumayı bozar;
gövde metni `0.03em` ve altında kalır.

**The Tabular Rule.** `font-variant-numeric: tabular-nums` gövdede açıktır ve
kapatılmaz. Bir tahtada sayılar sütun hâlinde hizalanır, akışkan genişlikte değil.

## Layout

Sayfa dikey bir yığındır, ızgara değil: yapışkan metal ray → zaman şeridi →
(sözlük şeridi / uyarı bandı, talep üzerine) → GİDEN tahtası → GELEN tahtası →
servis bandı → alt bant. Ana içerik `--gut` (16px, dar ekranda 10px) yan
boşlukla akar ve tam genişliği kullanır; ortalanmış okuma kolonu yoktur çünkü
sütun hizası bu dünyanın kendisidir.

**Ritim.** Boşluk kademesi dar ve tekrarlıdır: 1px (hat), 3–6px (etiket-değer),
10px (hücre yatay), 16px (`--gut`, çekmece ve açılım dolgusu), 22px (bölüm
aralığı), 26px (ana bölümler arası), 40px (sayfa dibi). Satır yüksekliği
`--row-h: 36px` tahtada, 26px servis bandında sabittir — servis bandı kasten
daha sıkıdır, çünkü tahta değil tahtanın arkasıdır.

**Kırılımlar.** 1100px altında servis bandının iki sütunu ve ham istek/yanıt
çifti tek sütuna iner (`minmax(0, 1fr)` ile — `1fr` grid öğesinin `min-width:
auto`'su yüzünden sayfayı kaydırıyordu). 760px altında ray sarılır ve saatler
tam genişliğe geçer, zaman şeridinin konumlu atlama düğmeleri sıraya dizilir,
tahtalar kendi kabında yatay kayar (`min-width: 620px`) ve ikincil kimlik
sütunları (TİP, VKN, KAYIT) tahtadan çekilir — kaybolmazlar, satır açılımının
künyesinde dururlar.

### Named Rules

**The Board-Scrolls-Not-Wraps Rule.** Dar ekranda tahta yatay kayar; hücre
sarmalanmaz, satır yüksekliği değişmez. Sütun hizası tahtanın özüdür.

**The Reading-Stays-Put Rule.** Tahta kayarken SATIR AÇILIMI kaymaz: açılım
hücresi `position: sticky; left: 0` ile sol kenara yapışır ve künye ekran
genişliğine oturur. Kayan şey veri sütunudur, okuma metni değil.

## Elevation & Depth

Bu sistemde derinlik havadan değil **malzemeden** gelir. Yumuşak, yayılan gölge
yoktur; onun yerine iki teknik iş görür: (1) 1px'lik iç vurgu ve tam siyah hat
çiftiyle çizilen fiziksel kenar, (2) kanatçığın altına sıkışan kısa mat gölge.
Tek bir gerçek "yüzen" yüzey vardır — çekmece — ve yalnız o yayılan gölge taşır.

### Shadow Vocabulary
- **Kanatçık** (`inset 0 1px 0 var(--flap-hi), inset 0 -8px 10px -10px #000`):
  her tahta satırı. Üstte menteşenin saç teli, altta mat gölge. İkisi birden
  olmadan satır kanatçık değil, koyu bir tablo satırıdır.
- **Tahta kasası** (`inset 0 0 0 1px #1a1e25, 0 3px 0 rgba(0,0,0,.75)` + `1px solid #000`):
  kanatçık modüllerini tutan metal çerçeve. Yalnız tahta gövdesine uygulanır.
- **Ray** (`inset 0 1px 0 #262b33, 0 2px 0 rgba(0,0,0,.6)`): üstteki metal
  şeridin kalınlığı. Yalnız raya ve çekmece başlığına uygulanır.
- **Açılım ağzı** (`inset 0 8px 14px -10px #000`): açılan boşluğun içine düşen
  gölge; kanatçığın kalktığını söyler.
- **Düğüm çukuru** (`0 0 0 3px #0b0d11`): zaman ekseni düğümünün ekseni kestiği
  yerdeki zemin halkası; `1220` düğümünde dışına `0 0 0 4px var(--green)` halkası eklenir.
- **Çekmece** (`-18px 0 40px rgba(0,0,0,.6)`): sayfanın tek yayılan gölgesi,
  yalnız sağdan giren çekmecede.

### Named Rules

**The Material-Not-Air Rule.** Derinlik kenarla ve kanatçık gölgesiyle anlatılır.
Renkli halo, parıltı (`glow`) ve yumuşak yükseltme yoktur: sanal saatteki sapma
bile parıltıyla değil kehribar bir taban çizgisiyle (`inset 0 -2px 0`) söylenir.

## Shapes

Yuvarlaklık yoktur. Her köşe dik, her kenar 1px'lik bir hattır (`--rounded.none:
0`); pill, kapsül ve yuvarlatılmış kart bu dünyanın parçası değildir. Durum
"pill"leri bile çerçevesiz düz metindir. Çerçeveli öğeler (düğme, chip, kural
künyesi, alarm) dikdörtgen bir kutudur ve çerçeve rengi anlamı taşır: nötr
`--edge`, sarı kural künyesinde `#3a2f10`, alarmda `#40201f`, arşiv kayıtlarında
`#2c3444`.

İşaret dili de aynı geometriyi konuşur: **12×12 kutu, 1.6 kalınlık, kesik uç
(`stroke-linecap: square`), dik açı (`stroke-linejoin: miter`)**, `fill: none`,
`stroke: currentColor`. Saat/mühür/zincil işaretleri 1.4 kalınlıkta aynı dilde
çizilir. Yuvarlak uç yoktur.

### Named Rules

**The Drawn-Marks-Only Rule.** Her işaret elle çizilmiş SVG'dir. Unicode glifi,
emoji, ikon fontu ve `<img>` işareti kullanılmaz: durum taşıyan bir işaretin
yazı tipine göre başka görünmesi kabul edilemez.

**The Zero-Radius Rule.** `border-radius` sıfırdır ve istisnası yoktur.

## Components

### Buttons
- **Shape:** dik köşe (0), 1px çerçeve.
- **Tahta düğmesi (flap):** kanatçık zemini (`--flap`), `--edge` çerçeve, üst
  kenarı `--flap-hi` ile aydınlatılmış (kanatçığın ışığı), Board 600 11.5px
  `0.12em` versal, `6px 11px` dolgu. Hover'da zemin ve çerçeve bir kademe açılır.
  Açık hâl (`.on`) sarı zemin + siyah metin.
- **Birincil (`.primary`):** sarı zemin, siyah metin, çerçevesiz, Board 600 13px
  `0.14em` versal, `9px 18px`. Sayfada aynı anda tek bir birincil eylem olur —
  çekmecenin gönder düğmesi. Devre dışı hâlde `--edge` zemin + `--dim` metin.
- **Sessiz düğme (kapat/gizle/göster):** zeminsiz, `--edge` veya `--edge-soft`
  çerçeve, `--dim` metin, `2px 8px`. Hover metni `--text`'e yükseltir.
- **Focus:** genel kural — `2px solid var(--yellow)` dış hat, `2px` boşluk;
  tahta satırında `-2px`, menteşe düğmesinde `3px` boşluk.

### Chips
- **Style:** dik köşe, `--edge` çerçeve, zeminsiz, Data 11.5px, `4px 8px`.
  Gerçek `<input>` görsel olarak gizlenir, etiket taşıyıcıdır.
- **State:** seçili hâl sarı zemin + siyah metin; odak `:has(input:focus-visible)`
  ile sarı dış hat.

### Cards / Containers
Kart yoktur. Üç kap türü vardır:
- **Tahta:** `--board` zemin, `1px solid #000` çerçeve, kasa gölgesi, sarı alt
  çizgili sütun bandı (`2px solid var(--yellow)`), sütunlar arasında
  `rgba(0,0,0,.55)` modül aralığı.
- **Şerit (servis bandı):** `#0b0c0f` zemin, `--edge-soft` çerçeve, `#0e1014`
  başlık satırı. Tahtadan kasten daha sessiz malzeme.
- **Bant (sözlük/uyarı/hata):** tam genişlikte, hafif renkli zemin
  (`#131a12` yeşil, `#16110a` kehribar, `#1d0f11` kırmızı) ve 2px üst kenar.

### Inputs / Fields
- **Style:** `#101318` zemin, `--edge` çerçeve, dik köşe, Data 13px, `7px 8px`.
  Etiket üstte Board 600 11px `0.14em` versal `--faint`.
- **Focus:** çerçeve sarıya döner, `outline: none` (çerçevenin kendisi odak
  işaretidir). Yer tutucu `--faint`.
- **Caret / seçim:** `caret-color` ve `::selection` sarı, seçili metin siyah.

### Navigation
Gezinme yoktur (tek sayfa). Yerini **ray** alır: yapışkan üst metal şerit,
solda MIMMOCK künyesi + sürücü/şema plaka satırı (Data 11px `--faint`), ortada
iki saat (GERÇEK / SANAL, her biri çizilmiş kadran işaretiyle), sağda bağlantı
lambası ve tahtanın dilinde kumanda düğmeleri. Lamba 7×7 kare bir ampuldür,
2px boşlukla `outline` halkası taşır: yanık yeşil, sönük kırmızı — ve sözcüğünü
de yazar.

### Board Row (imza bileşeni)
Sabit 36px yüksekliğinde kanatçık satırı. Üstünde menteşe hattı, altında mat
gölge, zemin `--flap`. Hover bir kademe açılır; açık satır `--flap-hi` menteşeyi
korur ve ilk hücresine `inset 3px 0 0 var(--yellow)` sol çıta alır. Satırın
kendisi birincil eylemdir (tıklanabilir `<tr>`), ilk hücrede gerçek bir
`<button>` ve menteşe oku durur. **Menteşe oku dönmez** — `path`'i değişir;
sayfadaki tek dönme çevirmedir.

### SATIR AÇILIMI (imza bileşeni)
Satırın altına inen `#0b0d11` zeminli, `3px solid var(--yellow)` sol kenarlı
alan. 220ms `cubic-bezier(.2,.8,.2,1)` ile `grid-template-rows: 0fr → 1fr`
üzerinden açılır. İçinde: `auto-fit minmax(170px, 1fr)` künye ızgarası (ETTN gibi
36 karakterlik değerler `span 2`), sonra **tek dikey zaman ekseni** — `78px /
22px / 1fr` ızgarası, `#525c6b` eksen çizgisi, 7×7 düğüm kareleri, solda mono
saat, sağda kural kimliği · ham GİB kodu · alarm. Zaman boşluğu kesik çizgiyle
(`repeating-linear-gradient` 3px/3px) gösterilir ve süreyi kendisi yazar.

### Flip (imza bileşeni)
Split-flap hücresi. Çevirme **karakter bazlıdır**: yalnız değişen karakter
döner, soldan sağa 26ms kademeyle (en fazla 10 karakter kademelenir). Dönen
kanatçığın kendi yüzü vardır (`--flap-hi` kart gövdesi + ortasında yatay dikiş);
çıplak glif çevirmek split-flap değildir. Animasyon 250ms
`cubic-bezier(.2,.8,.2,1)`, `rotateX(-86deg) → 10deg → 0`. Erişilebilirlik:
kanatçıklar `aria-hidden`, yanlarında `.sr-only` düz metin.

### Term (açıklama çıpası)
Katman kapalıyken **hiçbir iz bırakmaz** — düz metin döner. Açıkken noktalı alt
çizgi (`--dim`), hover'da sarıya döner, seçiliyken düz sarı çizgi + sarı metin.
`cursor: help`.

### Named Rules

**The Flip-Means-Change Rule.** Sayfanın tek hareket grameri çevirmedir ve
yalnız bir değer değiştiğinde çalışır. İlk boyamada çevirme yoktur (25 satırın
birden dönmesi kuralı aşındırırdı). Başka hiçbir yerde döndürme, kayma veya
yükselme animasyonu yoktur.

**The Reduced-Motion-Keeps-The-News Rule.** `prefers-reduced-motion: reduce`
altında çevirme tek karelik sarı bir vurguya (`600ms step-end`) iner, açılım
anlık yüksekliğe, çekmece anlık konuma geçer. Hareket kaybolur, **değişim haberi
kalmalıdır** — animasyonu tamamen kaldırmak yanlıştır.

**The Density-First Rule.** Yoğunluk varsayılandır, açıklama talep üzerine
gelir. Öğretici bir katman uzman kullanıcıyı asla yavaşlatmaz; kapalıyken
sayfada yer, çizgi ya da ikon işgal etmez.

## Do's and Don'ts

### Do:
- **Do** her ölçülen sayıyı `--data-font` ile diz: belge no, VKN, ham GİB kodu,
  saat, ETTN, tutar, dizi numarası.
- **Do** her yeni durumu üç katmanla getir: çizilmiş 12×12 işaret + sözcük + renk.
- **Do** yeni işaretleri ortak dilde çiz: 12×12 kutu, 1.6 kalınlık, kesik uç,
  dik açı, `currentColor`.
- **Do** derinliği kenar ve kanatçık gölgesiyle anlat (`inset 0 1px 0 var(--flap-hi)`
  üstte, `inset 0 -8px 10px -10px #000` altta).
- **Do** sarı zemin üzerine daima saf siyah (`#000`) metin yaz.
- **Do** yeni yüzey eklerken tarayıcı yüzeylerini de temala: `::selection`,
  scrollbar, caret, `:focus-visible`, `color-scheme`, `theme-color`.
- **Do** dar ekranda tahtayı yatay kaydır ve ikincil kimlik sütunlarını satır
  açılımının künyesine bırak.
- **Do** yeni metin renklerini ölçülmüş kontrastla seç; taban `--faint` (~4.6:1).

### Don't:
- **Don't** `border-radius` kullanma; bu dünyada yuvarlak köşe yok.
- **Don't** Unicode glifi, emoji ya da ikon fontu ile durum işareti yapma.
- **Don't** çevirme animasyonunu değişim dışında bir şey için kullanma —
  ilk boyamada, hover'da ya da sayfa girişinde çevirme yok.
- **Don't** renkli halo, parıltı ya da yumuşak yükseltme ile durum anlatma;
  sapma bile kehribar bir taban çizgisiyle söylenir.
- **Don't** `0.1em` üstü harf aralığını karışık büyük-küçük metinde kullanma;
  geniş aralık yalnız kısa versal etikettedir.
- **Don't** yüzleri Google Fonts'tan ya da sistemden çağırma; latin-ext dahil
  self-host şart (`ğ ş İ`).
- **Don't** `tabular-nums`'ı kapatma ve sayı sütunlarını orantılı rakamla dizme.
- **Don't** açıklama/öğretici katmanını varsayılan açık bırakma ya da kapalıyken
  iz bırakan bir işaret koyma.
- **Don't** eşit boyutlu kart ızgarası ya da kahraman metrik ekleme; bu yüzeyin
  reddettiği kategori düzeni budur.
