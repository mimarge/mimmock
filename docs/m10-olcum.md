# M10 — paketleme ve yayın: ölçüm kaydı

**Tarih:** 2026-09-23 · **Sürüm:** `0.1.0`

| | |
|---|---|
| Depo | https://github.com/mimarge/mimmock — **public** |
| İmaj | `ghcr.io/mimarge/mimmock` — **public** · `0.1.0` · `0.1` · `latest` · `linux/amd64` + `linux/arm64` |
| Yayın yolu | `v*` etiketi → `.github/workflows/release.yml` (GitHub Actions, `GITHUB_TOKEN`) |

---

## 1. Yayın öncesi denetim

**Geçmiş temiz başlatıldı** (kullanıcı kararı). Eski yerel geçmiş kaldırılan yedek
doğrulama yolunun adını 91 kez ve kişisel e-postayı 9 commit'in yazar bilgisinde
taşıyordu. Son ağaçtan 15 mantıklı commit kuruldu; yazar GitHub noreply adresi.
Yeni geçmişin ağacı çalışma ağacıyla **birebir** aynı (dosya özetleri eşleşti).

| Tarama (yeni geçmişin tamamı + çalışma ağacı) | Sonuç |
|---|---|
| mimkit adresi, MimForge'un 11 gizli değeri | 0 |
| Gerçek-veri dizini izi (kapı 1) | 0 |
| Kaldırılan servis adı (kapı 1b) | 0 |
| Kişisel e-posta, yerel kullanıcı yolu | 0 |
| gitleaks, tam geçmiş (`.gitleaks.toml` gerekçeli istisnalarla) | **no leaks found** |
| Test sertifikası gerçek olamaz (kapı 3) | ✔ kendinden imzalı, TEST damgalı, CA değil |
| Sentetik korpus kimlikleri (kapı 4) | ✔ `corpus-identity.test.ts` |

gitleaks'in bilinçli istisnaları: tohum anahtarı `mimmock_dev_key`, tohum webhook
anahtarı, kapı 3'ün denetlediği test anahtarı. `.env` (yerel, gerçek anahtar) hiçbir
commit'e girmedi.

**Temiz klon kanıtı:** depo yerelden sıfır bir dizine klonlandı → kilitli kurulum,
lehçe ve belge tazeliği, tip denetimi, panel derlemesi, 195 ağsız test, imaj
derlemesi — hepsi geçti. Yani depo, yalnız benim makinemde duran hiçbir şeye
bağlı değil.

## 2. Yayın

| # | Ölçüm | Sonuç |
|---|---|---|
| Y1 | GitHub CI, ilk push (temiz makine) | ✔ `check` · `public-gates` · `image` · `fidelity` atlandı (bkz. §3) |
| Y2 | Sürüm iş akışı (`v0.1.0`) | ✔ çok mimarili imaj yayımlandı |
| Y3 | Paket görünürlüğü | ✔ public (organizasyon politikası kullanıcı onayıyla açıldı; yalnız Public paket izni eklendi) |
| Y4 | **Girişsiz** manifest | ✔ HTTP 200, `linux/amd64` + `linux/arm64` |
| Y5 | **Girişsiz** `docker pull` (boş Docker yapılandırmasıyla) | ✔ |
| Y6 | README'deki `docker run` komutu, yayımlanmış imajla, uçtan uca | ✔ healthz `ok` · belge `DELIVERED` · `/docs` · `/llms-full.txt` · panel · PDF 200 |

Paket görünürlüğü için GitHub API sunmuyor (her iki uç 404); değişiklik organizasyon
ve paket ayarlarından yapıldı.

## 3. Açık kalanlar (kullanıcı kararı)

- **Lisans yok.** Depoda lisans dosyası bulunmuyor; OpenAPI belgesine yanlışlıkla
  yazılmış bir "MIT" iddiası yayından önce kaldırıldı. Lisanssız public depo "bütün
  hakları saklı" demektir: geliştirici imajı çalıştırabilir, kodu yeniden kullanma
  hakkı belirsizdir.
- **CI'da canlı mimkit ölçümü koşmuyor.** `fidelity` işi `vars.MIMMOCK_MIMKIT_URL`
  ve `secrets.MIMMOCK_MIMKIT_TOKEN` tanımlanınca koşar; ikisi de GitHub'a
  girilmedi (dış servise gizli değer koymak ayrı bir karar).
- **Eski yerel geçmiş** `yedek/eski-gecmis` dalında yalnız yerelde duruyor; uzakta yok.
- **Organizasyon ayarı:** `mimarge` artık üyelerin public paket yayımlamasına izin
  veriyor (öncesinde yalnız private). İstenirse mimmock yayımlandıktan sonra geri
  kapatılabilir — mevcut public paket etkilenmez mi, ölçülmedi.

## 4. Ne ölçülmedi

- Önbelleksiz, temiz bir makinede `docker run`'dan "hazır"a süre (bu makinede imaj
  katmanları kısmen önbellekteydi).
- `linux/amd64` imajının bir amd64 makinede çalıştırılması (manifestte var; bu makine
  arm64).
- Windows.
