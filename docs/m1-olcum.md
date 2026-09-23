# M1 ölçümü — iskelet

**Tarih:** 2026-09-22 · **Plan:** `mimforge/docs/superpowers/plans/2026-09-22-mimmock.md` §9/M1

> Plan M1'in ölçüsünü şöyle yazıyor:
> *"`docker run` → panel açılır, şirket tanımlanır. PG'ye geçince aynı şema."*
> Aşağıdakiler **çalışan sistemde** ölçüldü; yeşil test sayılmadı.

---

## 1. `docker run` → panel açılır

```
docker build -t mimmock:m1 .          → imaj kuruldu
docker run -d -p 8088:8088 mimmock:m1 → 2 sn'de /healthz yanıt verdi
```

| Ölçüm | Sonuç |
|---|---|
| `/healthz` | `{"status":"ok","api":"mimmock v1","dialect":"sqlite","schemaFingerprint":"083aa792","panelTokenRequired":false,"panelAvailable":true}` |
| `X-MimMock-Api` başlığı | `1` — plan §0-2 tedbiri yerinde |
| Panel HTML | sunuldu (`<title>MimMock — sandbox paneli</title>`) |
| Panel JS | HTTP 200, 225 987 bayt |
| Panel tarayıcıda | **render etti** — ekran görüntüsüyle doğrulandı, React ayakta |
| Tohum veri (K13) | `mimmock_dev_key` + `1111111111`, `2222222222` |

## 2. Şirket tanımlanır

| Yol | Sonuç |
|---|---|
| API `POST /v1/companies` | **201**, kaynak geri okundu |
| **Panelden form** | `6666666666 DENEME PANEL A.Ş.` yazıldı, liste 4'e çıktı, form temizlendi |
| Kalıcılık | `docker restart` sonrası 3 şirket yerinde — durum bellekte değil diskte |

## 3. PG'ye geçince aynı şema

`docker compose up` (aynı imaj, `MIMMOCK_DB=postgres://…`):

| Ölçüm | SQLite | PostgreSQL |
|---|---|---|
| `healthz.dialect` | `sqlite` | `pg` |
| `healthz.schemaFingerprint` | `083aa792` | **`083aa792`** (birebir) |
| Tohum + şirket tanımlama | ✅ | ✅ 201 |
| Aynı VKN ikinci kez | 409 | **409** |
| `pk_aliases` kolon tipi | `TEXT` (json kipi) | `jsonb` |
| `e_invoice_registered` | `INTEGER` (boolean kipi) | `boolean` |
| `created_at` | `INTEGER` (ms) | `timestamptz` |

Lehçeye uygun tipler, **tek tariften** üretildi (`server/src/db/spec.ts`).

## 4. Test takımı

```
vitest: 3 dosya · 30 test (SQLite)
        + MIMMOCK_TEST_PG → 42 test (companies uçları iki sürücüde)
```

### Mutasyon sınaması — bekçiler gerçekten çalışıyor mu

Her kapı bozularak sınandı; hiçbiri sessiz kalmadı:

| Mutasyon | Sonuç |
|---|---|
| `spec.ts`'e kolon ekle, codegen koşma | **2 test kırmızı** (üretim güncel değil + kolon eksik) |
| `X-MimMock-Api` başlığını kaldır | **1 test kırmızı** |
| VKN kapısını gevşet (her şeyi kabul et) | **5 test kırmızı** |
| Kimlik kapısını kaldır | **2 test kırmızı** |
| PG lehçesinde kolon adını değiştir | **2 test kırmızı** (lehçe eşitliği) |
| CI kapı 1: yasaklı veri izi ekle | **kırmızı** |
| CI kapı 2: sahte özel anahtar ekle | **kırmızı** |

### Yakalanan bir sahte yeşil

`healthz` testi `expect(['sqlite','pg']).toContain(dialect)` yazıyordu — PG koşumunda
SQLite açılsa bile geçerdi. `expect(dialect).toBe(driverName)` ile daraltıldı.

Bir ikincisi ölçüm sırasında yakalandı: `docker compose up` port çakışmasıyla
başlayamamıştı, ama eski container hâlâ 8088'i tuttuğu için `/healthz` "ok" döndü.
`dialect` alanına bakılmasaydı PG ölçümü sahte yeşil olurdu.

## 5. M1'de ÖLÇÜLMEYENLER

- **`X-Company` yalnız çözümleme düzeyinde** sınandı (`CONTEXT`/`INVALID_VKN` kapıları).
  Zorunlu kılan bir uç M2'de doğacak.
- **Panel tasarımı** `impeccable` döngüsünden geçmedi — o iş M9'dur (K17). M1 paneli
  işlevsel iskelettir.
- **Ağ bağımlılıkları** (kittest: numaratör/şablon/şema — K4) M1'de hiç kullanılmadı;
  ağ kapısının "mock KALKMAZ ve sebebini söyler" davranışı M2'de kurulacak.
- **Test sertifikası / imza** yok (M2).
