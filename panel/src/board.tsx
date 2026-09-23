/**
 * Tahtanın kendi parçaları: çevrilen hücre, durum hücresi, terim çıpası, zaman.
 *
 * Buradaki tek görsel fikir ÇEVİRMEDİR (split-flap). Sayfada başka hiçbir yerde
 * çevirme yoktur; bir şey çevriliyorsa değişmiştir.
 */
import { createContext, useContext, useRef } from 'react';
import { GLOSSARY } from './glossary.js';
import {
  MarkCancelled,
  MarkClosed,
  MarkDelivered,
  MarkFailed,
  MarkHeld,
  MarkTransit,
} from './icons.js';

/* ── Terim katmanı ───────────────────────────────────────────────────────── */

export interface GlossaryState {
  /** Açıklama katmanı açık mı — yoğunluk varsayılan, açıklama talep üzerine. */
  enabled: boolean;
  open: (term: string | null) => void;
  active: string | null;
}

export const GlossaryContext = createContext<GlossaryState>({
  enabled: false,
  open: () => {},
  active: null,
});

/**
 * Sözlükte karşılığı olan bir terimi çıpalar.
 * Katman kapalıyken HİÇBİR iz bırakmaz — tahtanın yoğunluğu bozulmaz.
 */
export function Term({ k, children }: { k: string; children: React.ReactNode }) {
  const ctx = useContext(GlossaryContext);
  if (!ctx.enabled || !GLOSSARY.has(k)) return <>{children}</>;
  return (
    <button
      type="button"
      className={ctx.active === k ? 'term on' : 'term'}
      onClick={(e) => {
        e.stopPropagation();
        ctx.open(ctx.active === k ? null : k);
      }}
      aria-expanded={ctx.active === k}
    >
      {children}
    </button>
  );
}

/* ── Çevrilen hücre ──────────────────────────────────────────────────────── */

/**
 * Split-flap hücresi.
 *
 * 🔑 Çevirme KARAKTER BAZLIDIR: gerçek tahtada da yalnız değişen kanatçık döner.
 * Bunun sonucu doğru bir davranıştır — sanal saat normal akarken yalnız saniye
 * hanesi kıpırdar, ama 16 gün ileri atlanınca bütün hane birden çevrilir ve
 * atlama tahtanın her yerinden görülür.
 *
 * Ekran okuyucu tek parça okur: kanatçıklar `aria-hidden`, yanında düz metin.
 */
export function Flip({ text, className }: { text: string; className?: string }) {
  const prev = useRef<string | null>(null);
  const vers = useRef<number[]>([]);
  const chars = Array.from(text);

  if (vers.current.length !== chars.length) {
    vers.current = chars.map((_, i) => vers.current[i] ?? 0);
  }
  if (prev.current !== null && prev.current !== text) {
    const before = Array.from(prev.current);
    chars.forEach((c, i) => {
      if (before[i] !== c) vers.current[i] = (vers.current[i] ?? 0) + 1;
    });
  }
  prev.current = text;

  return (
    <span className={className ? `flip ${className}` : 'flip'}>
      <span className="sr-only">{text}</span>
      {chars.map((ch, i) => (
        <span
          key={`${i}:${vers.current[i]}`}
          /*
           * İlk boyamada çevirme YOK. Sayfanın açılması bir haber değildir;
           * 25 satırın birden dönmesi "çevrilen şey = değişen şey" kuralını
           * aşındırırdı. Kanatçık ancak ikinci kez yazıldığında döner.
           */
          className={vers.current[i] ? 'flap turn' : 'flap'}
          style={{ animationDelay: `${Math.min(i, 10) * 26}ms` }}
          aria-hidden="true"
        >
          {ch === ' ' ? '\u00a0' : ch}
        </span>
      ))}
    </span>
  );
}

/* ── Durum hücresi ───────────────────────────────────────────────────────── */

type Tone = 'transit' | 'ok' | 'fail' | 'closed' | 'cancel' | 'held';

const TONE_BY_STATUS: Readonly<Record<string, Tone>> = {
  RECEIVED: 'transit',
  AWAITING_SIGNATURE: 'transit',
  AWAITING_NUMBERING: 'transit',
  PROCESSING: 'transit',
  SENT_TO_GIB: 'transit',
  DELIVERED: 'ok',
  SEND_FAILED: 'fail',
  REPORTED: 'closed',
  CANCELLED: 'cancel',
};

const MARK: Readonly<Record<Tone, (p: { size?: number }) => React.JSX.Element>> = {
  transit: MarkTransit,
  ok: MarkDelivered,
  fail: MarkFailed,
  closed: MarkClosed,
  cancel: MarkCancelled,
  held: MarkHeld,
};

export function toneOf(status: string): Tone {
  return TONE_BY_STATUS[status] ?? 'transit';
}

/**
 * Durum hücresi: işaret + sözcük + renk.
 * ⚠️ Renk hiçbir zaman TEK taşıyıcı değildir; işaret ve sözcük her koşulda orada.
 *
 * 🔴 "Askıda" bilgisi buraya GİRMEZ — canlı ölçümde yakalandı: `held` durumu
 * boyayınca `SEND_FAILED` kırmızı yerine kehribar göründü ve duraklatma işareti
 * aldı. Belgenin durumu SEND_FAILED'dır; askıda olması SIRADA sütununun sözüdür.
 */
export function Status({ value }: { value: string }) {
  const tone = toneOf(value);
  const Mark = MARK[tone];
  return (
    <span className={`status t-${tone}`}>
      <Mark />
      <Term k={value}>
        <Flip text={value} />
      </Term>
    </span>
  );
}

/* ── Zaman ───────────────────────────────────────────────────────────────── */

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Tahta saati: ana hane `14:02`. Çevirme ancak burada haber olur. */
export function clockText(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Saniye hanesi: `:37`. Sessizce akar, çevrilmez. */
export function secondsText(d: Date): string {
  return `:${String(d.getSeconds()).padStart(2, '0')}`;
}

/** İşaretli süre farkı: `+12sn`, `+3g 4sa`, `-40dk`. */
export function deltaText(ms: number): string {
  const sign = ms < 0 ? '-' : '+';
  const a = Math.abs(ms);
  if (a < MIN) return `${sign}${Math.round(a / SEC)}sn`;
  if (a < HOUR) return `${sign}${Math.round(a / MIN)}dk`;
  if (a < DAY) {
    const h = Math.floor(a / HOUR);
    return `${sign}${h}sa ${Math.round((a - h * HOUR) / MIN)}dk`;
  }
  const d = Math.floor(a / DAY);
  return `${sign}${d}g ${Math.round((a - d * DAY) / HOUR)}sa`;
}

/** Yalnız tarih: `23.09.2026`. Sanal saat gün atlayınca fark BURADAN okunur. */
export function dateText(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** Tarih+saat, tahtada dar: `22.09 14:02`. */
export function stampText(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
