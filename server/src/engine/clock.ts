/**
 * Saat — iki kipli (plan §5a).
 *
 *  - **gerçek zaman** (varsayılan): geliştirici dostu, belgeler kendiliğinden ilerler.
 *  - **sanal zaman**: `_sandbox/clock` ile atlanır; otomatik test bir haftalık akışı
 *    saniyeler içinde koşturur.
 *
 * 🔑 Sadakat ile kullanılabilirlik burada barışır: mock 15 günlük poll deadline'ını
 * SADIK biçimde bekler (belge asılı kalır), ama saat bir komutla 15 gün ileri atlar.
 */
export interface Clock {
  now(): Date;
  /** Sanal saati ileri atar. Gerçek kipte de çalışır: kayma birikir. */
  advance(ms: number): void;
  /** Sanal saati mutlak bir ana kurar. */
  setTo(instant: Date): void;
  /** Kayma (ms) — 0 ise saat gerçek zamanla aynı. */
  offsetMs(): number;
  reset(): void;
}

export function createClock(): Clock {
  let offset = 0;
  return {
    now: () => new Date(Date.now() + offset),
    advance: (ms) => {
      offset += ms;
    },
    setTo: (instant) => {
      offset = instant.getTime() - Date.now();
    },
    offsetMs: () => offset,
    reset: () => {
      offset = 0;
    },
  };
}
