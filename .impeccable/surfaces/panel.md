# Yüzey: Panel (`/` — tek sayfa SPA)

**Mod:** Operate. Ziyaretçi bir işi tamamlar; taranabilirlik ve gerçek kullanım
sahnesi ifadenin önünde gelir. Marka, kesin ayrıntıda yaşar.

**Kullanım sahnesi (PRODUCT.md, kullanıcı onayı):** panel ikinci ekranda sürekli
açık durur. Yoğunluk varsayılandır, açıklama talep üzerine gelir.

## Direction contract

**THESIS.** Bu yüzey bir **durum tahtasıdır**, bir gösterge paneli değil. Sahip
olduğu tek fikir: bir simülasyonun akan hâli, tek bir ortak zaman ekseninde
dizilmiş satırlar olarak okunur. Reddettiği kategori düzeni: eşit boyutlu kart
ızgarası ve kahraman metrik. Belgenin durumu bir sayı değil, tahtadaki bir
satırın o andaki okunuşudur.

**OWN-WORLD.** Solari split-flap tahtası. Mürekkep siyahı gövde (`#0a0b0d`),
bir ton açık kanatçık yüzeyi, her satırın üstünde saç teli kalınlığında bir flap
menteşesi ve altında mat gölge. Sıcak kireç beyazı metin, tahta sarısı sütun
başlıkları (`#f0b429`), durum için tahta yeşili/kehribar/kırmızı — ama renk asla
tek taşıyıcı değil: her durumun çizilmiş bir işareti ve sözcüğü var. Barlow
Condensed 600 versal tahta satırlarında, IBM Plex Mono ölçülen her sayıda
(ETTN, ham GİB kodu, saat, tutar), Barlow açıklama katmanında. İçeriği
boşaltsanız bile menteşe çizgisi, sarı sütun bandı ve monospace sayı sütunları
bu tahtayı tanınır kılar.

**STORY.** Geliştirici tahtaya bakar ve üç şeyi sırayla anlar: belgelerim şu an
nerede (satır + durum), oraya neden geldi (satırı açınca inen olay şeridi, her
olay kural kimliği ve ham GİB kodu ile), sırada ne var (SIRADA sütunu ve sanal
saatte kalan süre). Sonra saati ileri atar ve tahtanın döndüğünü görür —
mock'un öğrettiği şey budur: teslim anı `1220`'dir, `1300` değil; `1230` teslimi
geri alır; askıda kalan belge hata değildir, açık bırakılmış bir zarftır.

**FIRST VIEWPORT.** Üstte tam genişlikte metal bir ray: solda MIMMOCK künyesi ve
sürücü/şema, ortada **iki saat yan yana** — GERÇEK ve SANAL — sanalın altında
sapma (`+16g 04:12`) ve doğrudan onun üzerinde oturan zaman kumandası, sağda
mimkit bağlantı lambası (tek dış bağımlılık). Rayın hemen altında GİDEN tahtası ekranın
baskın kütlesi olarak başlar: sarı sütun bandı (BELGE NO · TİP · ALICI ·
DURUM · HAM · İMZA · SENARYO · SIRADA), ardından sabit yükseklikli satırlar.
Birincil eylem — bir satırı açmak — satırın kendisidir; ikincil kumandalar
(ilerlet, 1230, görüntü) satır sağında, tahtanın kendi dilinde küçük düğmeler.
Katlamanın hemen altında GELEN tahtası başlar. Servis bandı (webhook teslimleri,
ham istek günlüğü) tahtanın altında farklı malzemede, daha sıkı satırlarla.

**Signature interaction — SATIR AÇILIMI.** Bir tahta satırına tıklandığında satır
menteşesinden ayrılır: kanatçık yukarı kalkar, altındaki satırlar aşağı kayar ve
açılan boşluğa **tek dikey zaman ekseni** iner. Eksen üzerinde her olay kendi
anına çakılıdır; solda saat (mono, sanal), eksende çizilmiş düğüm, sağda kural
kimliği · ham GİB kodu · alarm. Ekseni aşağı takip etmek belgenin hikâyesini
okumaktır. Giden bir belge teslim olduysa eksenin dibinde alıcının kutusundaki
karşılığına giden bir bağlantı durur — zincir geri izlenebilir.

**Motion grammar.** Tek bir gramer: **çevirme**. Bir durum değiştiğinde o hücrenin
karakterleri split-flap gibi, soldan sağa 28 ms kademeyle çevrilir; başka hiçbir
yerde çevirme yoktur. Satır açılımı 220 ms `cubic-bezier(.2,.8,.2,1)` ile yükselir.
Saniye tıkı yalnız sanal saatte görünür. `prefers-reduced-motion: reduce` altında
çevirme tek karelik bir vurguya, açılım anlık yüksekliğe iner — hareket kaybolur,
bilgi kaybolmaz.

**FORM.** Uçuş Bilgi Tahtası — kendi sıralamamda **1.** sıradaki aday, karar
sayfasında `IMPECCABLE'S PICK` künyesiyle sunuldu. Zar `--scope direction
--mode operate` koşumunda **ASSIGNED INDEX 4**'ü (Matbu Evrak) atamıştı;
kullanıcı 1. adayı sabitledi, sabitleme zarı yener.

⚠️ **Seed anahtarı kayıp ve UYDURULMADI.** Atış gerçekten koşuldu (`ASSIGNED
INDEX 4` = Matbu Evrak) ama anahtarı bu oturumun bağlam sıkıştırmasında kayboldu;
`.impeccable/questions/1420ee43.state.json` yalnız karar sayfasının sunucu
durumunu tuttu, `.log` boş kaldı. Yerine yeni bir atış koşulmadı: yeni bir atış
YAPILMIŞ atışın kaydı değildir, başka bir atamayla bu kaydı doldurmak
denetlenebilirlik değil sahteciliktir. Kararın kendisi denetlenebilir kalıyor —
kullanıcı zarın atadığını değil, benim 1. adayımı seçti ve bu seçim yazılı.

**Atanan yönden ve meydan okuyanlardan alınan üç bağış** (bu inşada karşılanacak):
(a) her satırı yöneten **tek dikey zaman ekseni**, her olay kendi anına çakılı;
(b) her belge **adreslenebilir**, giden→gelen zinciri tam rotayı geri izliyor;
(c) senaryo ilerlemesi sayfanın **tek kesintisiz çizgisi**, geçerli adım işaretli
ve saat kumandası o çizginin üzerinde.

**Karşılanacak dürüst risk** (FIDS kartının kendi uyarısı): *"tahta metaforu
'neden oldu' sorusuna yer bırakmıyor."* Cevap SATIR AÇILIMI'dır: tahta ne oldu
ve sırada ne var sorularını taşır, neden sorusu satırın içinden açılır — ki bu
metaforun kendi doğal davranışıdır, uçuşa tıklayınca ayrıntı gelir.

**Sözleşmeden üç sapma — kayıtlı, gerekçesiz.** Belgeleyici inşayı sözleşmeyle
karşılaştırırken buldu: gövde `#08090b` (sözleşme `#0a0b0d`), tahta sarısı
`#f5b820` (sözleşme `#f0b429`), çevirme kademesi 26 ms (sözleşme 28 ms). Üçü de
kasıtsız; tonlar yan yana ayırt edilmiyor ve kademe farkı ölçülemiyor. İnşa
kazandı ve `DESIGN.md` gerçek değerleri kanonlaştırdı — kodu sonradan sözleşmeye
uydurmak, kanonu yanlışlamak olurdu. Sapma burada duruyor ki bir dahaki sefere
sözleşme yazarken değer kopyalansın, yuvarlanmasın.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the
finish review, the verdict, DESIGN.md, and every shipping raster carrying its
provenance.
