/**
 * Tohumlu rastgelelik — plan §5b: *"Tohumlu (`MIMMOCK_TRAFFIC_SEED`): geliştirici
 * bir hatayı yeniden üretebilsin."*
 *
 * `Math.random()` kullanan bir üreteç, "dün gördüğüm o tuhaf belgeyi bir daha
 * üret" isteğini imkânsız kılar. Determinizm burada bir süs değil, hata ayıklama
 * aracıdır — ETTN'ler bile tohumdan türer.
 */

/** mulberry32 — küçük, hızlı, tekrarlanabilir. Kriptografik DEĞİL (gerekmiyor). */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Metin tohumu → sayı. Aynı metin her zaman aynı akışı verir. */
export function seedFrom(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export interface Rng {
  next(): number;
  int(minInclusive: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
  /** Deterministik UUID v4 — tohumdan türer, `crypto.randomUUID()` DEĞİL. */
  uuid(): string;
  /** 2 ondalıklı tutar. */
  money(min: number, max: number): number;
}

export function createRng(seed: number): Rng {
  const random = createRandom(seed);
  const hex = (n: number): string =>
    Array.from({ length: n }, () => Math.floor(random() * 16).toString(16)).join('');
  return {
    next: random,
    int: (min, max) => min + Math.floor(random() * (max - min + 1)),
    pick: (items) => items[Math.floor(random() * items.length)]!,
    uuid: () => {
      // v4 biçimi: sürüm nibble'ı 4, varyant nibble'ı 8..b.
      const variant = '89ab'[Math.floor(random() * 4)]!;
      return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
    },
    money: (min, max) => Math.round((min + random() * (max - min)) * 100) / 100,
  };
}
