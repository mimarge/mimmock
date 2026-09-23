# Sadakat korpusu

**Kaynak:** MimForge `packages/tpl-forge/samples/{EFATURA,EARSIV}` — 15 belge.
**Kopyalandı, import edilmedi** (plan §2c): MimForge private depodur.

## Neden burada durabilir (plan §2b, kapı 4)

Bu belgelerin kimlikleri **kanıtlanabilir sentetiktir** ve bu bir varsayım değil,
ölçümdür:

| Eksen | Ölçülen değerler |
|---|---|
| VKN/TCKN | `1111111111` · `2222222222` · `3333333333` · `33333333333` · `4444444444` — hepsi tek rakamın tekrarı |
| Taraf adları | `DENEME …` · `ÖRNEK …` · `NUMUNE …` · `ORNEK EXAMPLE TRADING GMBH` |

`fidelity.test.ts` bu kapıyı her koşumda yeniden ölçer: sentetik olmayan bir kimlik
girerse test kırmızıya döner. Yani kapı belgede değil **testte** yaşıyor.

## Ne ölçüyor

Plan §6: *"MimForge'un ingest'inin KABUL ettiği UBL'i mock da kabul etmeli;
REDDETTİĞİNİ mock da reddetmeli."* Buradaki 15 belge **kabul** tarafıdır.

⚠️ **Ret tarafı burada YOK.** Sözlük §7.5 ölçtü: *"MimForge'un kendi içinde ret
etiketli TEK fikstür yoktur"* — negatif tarafın tamamı `json2ubl-ts`
(`examples-matrix/invalid/`, 94 senaryo) deposundan gelir. `fidelity.test.ts` o
depoya yol verilirse (`MIMMOCK_J2U_MATRIX`) o kümeyi de koşar; verilmezse mock'un
kendi mutasyon fikstürleriyle yetinir ve bunu test adında **açıkça söyler**.
