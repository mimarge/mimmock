# AGENTS.md — MimMock deposunda çalışan kodlama ajanları için

## Hangi işi yapıyorsun?

**A) MimMock'u kendi uygulamana entegre ediyorsun** (en yaygın durum):
Bu depoyu değiştirmen gerekmez. Şunları sırayla oku:

1. [`llms-full.txt`](./llms-full.txt) — tam kılavuz: durum makinesi, geçiş
   tablosu, senaryolar, webhook sözleşmesi ve doğrulama kodu, hata kataloğu,
   entegrasyon ve test tarifleri. **§1 "Kolay yanlış kurulan beş şey"i atlama.**
2. [`docs/openapi.json`](./docs/openapi.json) — OpenAPI 3.1 sözleşmesi. İstemci
   ve tip üretimi için bunu kullan; uç şekillerini tahmin etme.
3. Çalışan bir container'dan aynıları: `http://localhost:8088/llms-full.txt`,
   `/openapi.json`, `/docs`.

Kurulum: [`README.md` → Kurulum](./README.md#kurulum).

**B) MimMock'un kendisini geliştiriyorsun:** aşağıdaki kurallar geçerli.

## Depo kuralları

- **Kopya yok.** Aynı bilgi iki yerde yazılmaz. Durumlar `server/src/status.ts`,
  hata kodları `server/src/errors.ts`, geçişler `server/src/engine/transitions.ts`,
  senaryolar `server/src/engine/scenarios.ts` — belgeler ve panel bunlardan türetir.
- **Üretilmiş dosyaları elle düzenleme:**
  - `llms.txt`, `llms-full.txt`, `docs/openapi.json` → `pnpm --filter @mimmock/server docs:gen`
  - `server/src/db/dialects/*.generated.ts` → `pnpm db:codegen`
  CI ikisinin de tazeliğini ölçer (`docs:check`, `db:codegen:check`).
- **Bir uç ekler/değiştirirsen** `server/src/docs/openapi.ts`'i güncelle.
  `openapi.test.ts` sunucudaki her rotanın belgede, belgedeki her satırın
  sunucuda olduğunu ve gerçek yanıtların şemaya uyduğunu ölçer.
- **Düzyazı kılavuz** `server/src/docs/content/guide.md`'dedir; `{{…}}` yer
  tutucuları üretimde dolar. Tanımsız yer tutucu fırlatır.
- **Ölçülmemiş şeyi "ölçüldü" diye yazma.** MimForge atıfları `mimforge:<dosya>:<satır>`
  biçimindedir; kaynağı gösterilemeyen durum/kod eklenmez.
- **Tek dış bağımlılık mimkit'tir** (doğrulama + numaralama + görüntü). Başka bir
  doğrulama servisine yol açmayın; CI bunu tarar.
- **Gerçek GİB gönderimi yok.** İmza test sertifikasıyladır; gerçek mühür eklenmez.
- **Yeşil test doğruluk kanıtı değil.** Yeni bir kapı eklersen onu mutasyonla
  sına: bozuk girdi üret, testin gerçekten kırmızıya döndüğünü gör.

## Komutlar

```bash
pnpm install
pnpm --filter @mimmock/panel build             # panel derlenmeden sunulmaz
pnpm --filter @mimmock/server test:offline     # ağ istemeyen testler
MIMMOCK_TEST_MIMKIT_URL=<adres> MIMMOCK_TEST_MIMKIT_TOKEN=<anahtar> \
  pnpm --filter @mimmock/server test   # canlı mimkit ile hepsi
pnpm -r typecheck
pnpm --filter @mimmock/server docs:check       # belge kopyaları taze mi
```

`*.live.test.ts` dosyaları canlı mimkit ister; adres yoksa **atlanmaz,
düşer** — atlanan test ölçülmemiş testtir.
