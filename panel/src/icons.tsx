/**
 * Tahta işaretleri — HEPSİ ÇİZİLMİŞ.
 *
 * 🔴 Unicode glifi ya da emoji KULLANILMAZ: durum bilgisini taşıyan bir işaretin
 * yazı tipine göre başka görünmesi kabul edilemez. Ayrıca renk hiçbir durumun
 * TEK taşıyıcısı değildir — her durumun sözcüğü, rengi ve bu işareti vardır.
 *
 * Ortak dil: 12×12 kutu, 1.6 kalınlık, kesik uçlar, dik açı. Tahtanın mekanik
 * karakteri buradan gelir; yuvarlak uç yok.
 */
interface MarkProps {
  size?: number;
}

function Svg({ size = 12, children }: MarkProps & { children: React.ReactNode }) {
  return (
    <svg
      className="mark"
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Yolda — iki eğik çizgi, hareket yönü. */
export const MarkTransit = (p: MarkProps) => (
  <Svg {...p}>
    <path d="M1.5 6h5" />
    <path d="M6 2.5 9.5 6 6 9.5" />
  </Svg>
);

/** Teslim — tik. Tahtadaki tek kapanmış işaret. */
export const MarkDelivered = (p: MarkProps) => (
  <Svg {...p}>
    <path d="M1.8 6.4 4.5 9.2 10.2 2.9" />
  </Svg>
);

/** Hata — çapraz. */
export const MarkFailed = (p: MarkProps) => (
  <Svg {...p}>
    <path d="M2.6 2.6 9.4 9.4" />
    <path d="M9.4 2.6 2.6 9.4" />
  </Svg>
);

/** Askıda — duraklatma çubukları. Hata DEĞİL: açık bırakılmış zarf. */
export const MarkHeld = (p: MarkProps) => (
  <Svg {...p}>
    <path d="M4.2 2.4v7.2" />
    <path d="M7.8 2.4v7.2" />
  </Svg>
);

/** Kapandı / raporlandı — mühür karesi. */
export const MarkClosed = (p: MarkProps) => (
  <Svg {...p}>
    <rect x="2.3" y="2.3" width="7.4" height="7.4" />
    <path d="M4.6 6h2.8" />
  </Svg>
);

/** İptal — üstü çizili kutu. */
export const MarkCancelled = (p: MarkProps) => (
  <Svg {...p}>
    <rect x="2.3" y="2.3" width="7.4" height="7.4" />
    <path d="M2.3 9.7 9.7 2.3" />
  </Svg>
);

/** Gerçek saat — kadran. */
export const IconClockReal = ({ size = 14 }: MarkProps) => (
  <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor"
    strokeWidth="1.4" strokeLinecap="square" aria-hidden="true" focusable="false">
    <circle cx="7" cy="7" r="5.3" />
    <path d="M7 3.6V7l2.4 1.7" />
  </svg>
);

/** Sanal saat — kadran, ileri atlamış ok. Gerçek saatten AYIRT EDİLİR. */
export const IconClockVirtual = ({ size = 14 }: MarkProps) => (
  <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor"
    strokeWidth="1.4" strokeLinecap="square" aria-hidden="true" focusable="false">
    <path d="M12.3 7A5.3 5.3 0 1 1 7 1.7" />
    <path d="M7 3.6V7l2.4 1.7" />
    <path d="M8.4 1.7h3.9v3.9" />
  </svg>
);

/** İmza mührü — daire içinde kırık kenar (kendinden imzalı olduğunu söyler). */
export const IconSeal = ({ size = 12 }: MarkProps) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor"
    strokeWidth="1.4" strokeLinecap="square" aria-hidden="true" focusable="false">
    <path d="M6 1.3 10.7 4v4L6 10.7 1.3 8V4Z" />
    <path d="M4.3 6 5.6 7.3 7.9 5" />
  </svg>
);

/** Zincir bağlantısı — giden→gelen rotası. */
export const IconChain = ({ size = 12 }: MarkProps) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke="currentColor"
    strokeWidth="1.4" strokeLinecap="square" aria-hidden="true" focusable="false">
    <path d="M4.8 7.2 7.2 4.8" />
    <path d="M6.6 3 8 1.6a2.3 2.3 0 0 1 3.2 3.2L9.8 6.2" />
    <path d="M5.4 9 4 10.4A2.3 2.3 0 0 1 .8 7.2L2.2 5.8" />
  </svg>
);

/** Satır açılımı — menteşe oku. Kapalıyken aşağı, açıkken yukarı döner. */
export const IconHinge = ({ size = 10 }: MarkProps) => (
  <svg className="hinge" width={size} height={size} viewBox="0 0 10 10" fill="none"
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" aria-hidden="true" focusable="false">
    <path d="M1.6 3.4 5 6.8 8.4 3.4" />
  </svg>
);

/** Geçiş oku — olay ekseninde "şuradan şuraya". Tire yön taşımaz, ok taşır. */
export const IconArrow = ({ size = 14 }: MarkProps) => (
  <svg className="arrow" width={size} height={size} viewBox="0 0 14 8" fill="none"
    stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" aria-hidden="true" focusable="false">
    <path d="M0 4h11" />
    <path d="M8.4 1.2 11.6 4 8.4 6.8" />
  </svg>
);

/**
 * BİRİNCİL teslim çıpası — `1220`.
 *
 * 🔴 Bu işaret zorunludur: teslim anı hikâyenin merkezidir ve daha önce yalnız
 * YEŞİLLE ayrılıyordu. Renk hiçbir bilginin tek taşıyıcısı olamaz.
 */
export const MarkAnchor = ({ size = 12 }: MarkProps) => (
  <Svg size={size}>
    <path d="M6 2.2v7.6" />
    <path d="M3.4 4.4h5.2" />
    <path d="M2.2 7.4a3.8 3.8 0 0 0 7.6 0" />
  </Svg>
);
