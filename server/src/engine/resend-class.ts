/**
 * Resend sınıflaması — SSOT ÖLÇÜLDÜ: `packages/gib-envelope/src/workflow-contract.ts:92-96`
 * (sözlük §2.4, 33 kod).
 *
 * Bu sınıflama `SEND_FAILED`'dan çıkışın mümkün olup olmadığını belirler ve
 * geliştiriciye en çok şunu öğretir: **`SEND_FAILED` terminal değildir, ama her
 * hatadan aynı şekilde çıkılmaz.**
 */

/** A — zarf düzeyi hata: aynı imzalı XML + aynı ETTN + YENİ zarf-UUID ile yeniden gönder. */
const CLASS_A = [
  1110, 1111, 1120, 1130, 1131, 1132, 1133, 1141, 1142, 1162, 1170, 1171, 1172, 1175, 1180,
  1182, 1183, 1190, 1195, 1215, 1230,
] as const;

/** B — hata belgede/imzada: resend KAPALI; düzeltilmiş belge aynı ETTN ile YENİ POST. */
const CLASS_B = [1150, 1160, 1161, 1176, 1177, 1140, 1143, 1181] as const;

/** C — asla/bekle. `1163` tek "yeniden gönderilmemeli" kodu; `1300` kayda alınmış. */
const CLASS_C = [1163, 1164, 1300, 1235] as const;

export type ResendClass = 'A' | 'B' | 'C';

const TABLE = new Map<number, ResendClass>([
  ...CLASS_A.map((c) => [c, 'A'] as const),
  ...CLASS_B.map((c) => [c, 'B'] as const),
  ...CLASS_C.map((c) => [c, 'C'] as const),
]);

/**
 * `null` = tabloda YOK. Çağıran A gibi davranır — **bilinçli fail-open**
 * (`workflow-contract.ts:100-108`). Bu bir gözden kaçma değil, ölçülmüş karardır:
 * bilinmeyen bir kod yüzünden geliştiricinin belgesi kilitlenmesin.
 */
export function resendClassOf(code: number | null | undefined): ResendClass | null {
  if (code === null || code === undefined) return null;
  return TABLE.get(code) ?? null;
}

/**
 * ETTN GİB'de YALNIZ `1300`'de kayda alınır; `11xx/1215/1230`'da ETTN YANMAZ.
 * (Ölçülmüş yorum: `workflow-contract.ts:78-80`.)
 */
export const ETTN_BURNED_CODES = [1300] as const;

export const RESEND_CLASS_CODES = { A: CLASS_A, B: CLASS_B, C: CLASS_C } as const;
