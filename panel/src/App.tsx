/**
 * MimMock paneli — DURUM TAHTASI.
 *
 * Bu yüzey bir gösterge paneli değil, bir tahtadır: simülasyonun akan hâli tek
 * bir ortak zaman ekseninde dizilmiş satırlar olarak okunur. Üç soruyu sırayla
 * cevaplar — ne oldu (satır), neden oldu (satır açılımı), şimdi ne olacak
 * (SIRADA sütunu ve zaman şeridi).
 *
 * Kullanım sahnesi: ikinci ekranda sürekli açık. Bu yüzden yoğunluk
 * varsayılandır, açıklama TALEP ÜZERİNE gelir (rayda AÇIKLAMA anahtarı).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  getPanelToken,
  type ApiError,
  type Company,
  type Delivery,
  type Health,
  type InboxDocument,
  type MockDocument,
  type RequestLogEntry,
  type Webhook,
} from './api.js';
import { Flip, GlossaryContext, Term, clockText, dateText, deltaText, secondsText } from './board.js';
import { InboundBoard, OutboundBoard, type BoardCtl } from './boards.js';
import { GLOSSARY, codeGloss } from './glossary.js';
import { IconClockReal, IconClockVirtual } from './icons.js';
import { OpsDrawer } from './ops.js';
import { Deliveries, RequestLog } from './service.js';

/** Şeridin kapsadığı gelecek: 16 gün. POLL_DEADLINE 15 günü içine alır. */
const SPAN_MS = 16 * 24 * 3600 * 1000;

/** Logaritmik konum: 12 saniye ile 15 gün aynı şeride sığsın diye. */
function pos(deltaMs: number): number {
  if (deltaMs <= 0) return 0;
  const n = Math.log1p(deltaMs / 1000) / Math.log1p(SPAN_MS / 1000);
  return Math.min(n, 1) * 100;
}

const TICKS = [
  { ms: 60_000, label: '1dk' },
  { ms: 3_600_000, label: '1sa' },
  { ms: 86_400_000, label: '1g' },
  { ms: 8 * 86_400_000, label: '8g' },
  { ms: SPAN_MS, label: '16g' },
];

const JUMPS = [
  { ms: 30_000, label: '+30sn' },
  { ms: 3_600_000, label: '+1sa' },
  { ms: 16 * 86_400_000, label: '+16g' },
];

const WARN_KEY = 'mimmock.warnings.hidden';

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [documents, setDocuments] = useState<MockDocument[]>([]);
  const [inbox, setInbox] = useState<InboxDocument[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [requests, setRequests] = useState<RequestLogEntry[]>([]);
  const [retryPolicy, setRetryPolicy] = useState<{ delaysMs: number[]; maxAttempts: number } | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [error, setError] = useState<ApiError | null>(null);
  const [token, setToken] = useState(getPanelToken());
  const [live, setLive] = useState(true);
  const [lastAt, setLastAt] = useState<Date | null>(null);

  const [glossOn, setGlossOn] = useState(false);
  const [activeTerm, setActiveTerm] = useState<string | null>(null);
  const [ops, setOps] = useState(false);
  const [warnHidden, setWarnHidden] = useState(() => localStorage.getItem(WARN_KEY) === '1');

  /** Adreslenebilirlik: açık satır adres çubuğunda durur, yenileyince geri gelir. */
  const [open, setOpenRaw] = useState<string | null>(
    () => (location.hash.startsWith('#/doc/') ? location.hash.slice(6) : null),
  );
  const setOpen = useCallback((id: string | null) => {
    setOpenRaw(id);
    history.replaceState(null, '', id ? `#/doc/${id}` : location.pathname);
    /*
     * Zincir bağlantısı hedefi yalnız AÇIYORDU; uzun bir tahtada düğmeye
     * basınca ekranda hiçbir şey olmuyordu ve "tam rotayı geri izliyor" sözü
     * davranışta karşılanmıyordu. Hedef satır görüş alanına getirilir.
     */
    if (!id) return;
    requestAnimationFrame(() => {
      document
        .getElementById(`doc-${id}`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }, []);

  /* ── Saniye tıkı: sanal saat yerel olarak akar, sunucu yalnız sapmayı verir ── */
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const real = useMemo(() => new Date(), [tick]);
  const now = useMemo(() => new Date(Date.now() + offsetMs), [tick, offsetMs]);

  const refresh = useCallback(async () => {
    try {
      const [h, cs, docs, hooks, box, clock, reqs] = await Promise.all([
        api.health(),
        api.listCompanies(),
        api.listDocuments(),
        api.listWebhooks(),
        api.listInbox(),
        api.readClock(),
        api.listRequests(),
      ]);
      setHealth(h);
      setCompanies(cs.companies);
      setDocuments(docs.documents);
      setInbox(box.inbox);
      setWebhooks(hooks.webhooks);
      setRetryPolicy(hooks.retryPolicy);
      setOffsetMs(clock.offsetMs);
      setRequests(reqs.requests);
      const all = await Promise.all(hooks.webhooks.map((w) => api.listDeliveries(w.id)));
      setDeliveries(all.flatMap((d) => d.deliveries).sort((a, b) => b.sequence - a.sequence));
      setLastAt(new Date());
      setError(null);
    } catch (e) {
      setError(e as ApiError);
    }
  }, []);

  /* ── Canlı yenileme: ikinci ekranda sürekli açık duran bir yüzey ── */
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    void refreshRef.current();
    if (!live) return;
    const t = setInterval(() => void refreshRef.current(), 2000);
    return () => clearInterval(t);
  }, [live]);

  const run = useCallback(
    (action: () => Promise<unknown>) => {
      setError(null);
      void action()
        .then(() => refreshRef.current())
        .catch((e) => setError(e as ApiError));
    },
    [],
  );

  const ctl: BoardCtl = { now, open, setOpen, run, chainTo: setOpen };

  /** Şeritteki bekleyen olaylar — her belgenin bir sonraki adımı. */
  const pending = useMemo(
    () =>
      documents
        .filter((d) => d.engine.nextAt)
        .map((d) => ({
          id: d.id,
          delta: new Date(d.engine.nextAt as string).getTime() - now.getTime(),
          state: d.engine.nextState ?? '',
        }))
        .filter((p) => p.delta > 0),
    [documents, now],
  );

  const term = activeTerm ? GLOSSARY.get(activeTerm) : undefined;
  const termCode = activeTerm && /^\d+$/.test(activeTerm) ? codeGloss(Number(activeTerm)) : null;

  return (
    <GlossaryContext.Provider value={{ enabled: glossOn, open: setActiveTerm, active: activeTerm }}>
      <div className="fids">
        {/* ── RAY ─────────────────────────────────────────────────────────── */}
        <header className="rail">
          <div className="brand">
            <span className="wordmark">MIMMOCK</span>
            {health && (
              <span className="plateline">
                {health.dialect} · şema {health.schemaFingerprint.slice(0, 10)} · api {health.api}
              </span>
            )}
          </div>

          <div className="clocks">
            <div className="clock">
              <span className="clock-tag">
                <IconClockReal /> GERÇEK
              </span>
              {/*
                Saniye tıkı YALNIZ sanal saattedir (yön sözleşmesi, hareket
                grameri). Gerçek saate de verilince iki saatin ayrımı düzleşiyordu.
              */}
              <span className="clock-face mono">{clockText(real)}</span>
              <span className="clock-off mono">{dateText(real)}</span>
            </div>
            <div className={offsetMs === 0 ? 'clock virt' : 'clock virt shifted'}>
              <span className="clock-tag">
                <IconClockVirtual /> SANAL
              </span>
              <span className="clock-face mono">
                <Flip text={clockText(now)} />
                <span className="secs">{secondsText(now)}</span>
              </span>
              {/*
                🔴 TARİH ŞART. Canlı ölçümde yakalandı: saat 16 gün ileri atlayınca
                saat:dakika:saniye neredeyse aynı kaldı ve sanal saat gerçekle aynı
                görünüyordu. Atlamanın tamamı GÜN hanesindeydi.
              */}
              <span className="clock-off mono">
                <Flip text={dateText(now)} />
                {offsetMs !== 0 && <span className="shift"> {deltaText(offsetMs)}</span>}
              </span>
            </div>
          </div>

          <div className="rail-right">
            {/* Tek dış bağımlılık: doğrulama + numaralama + görüntü. */}
            <span className={health?.mimkit.ready ? 'lamp on' : 'lamp off'}>
              <span className="bulb" aria-hidden="true" />
              mimkit{' '}
              {health?.mimkit.ready
                ? 'bağlı'
                : health?.mimkit.offlineAllowed
                  ? 'ÇEVRİMDIŞI'
                  : 'ERİŞİLEMİYOR'}
            </span>
            <button
              type="button"
              className={live ? 'rail-btn live' : 'rail-btn'}
              onClick={() => setLive((v) => !v)}
              aria-pressed={live}
            >
              {live ? 'canlı · 2sn' : 'duraklatıldı'}
              {lastAt && <span className="dim"> {clockText(lastAt)}</span>}
            </button>
            <button
              type="button"
              className={glossOn ? 'rail-btn on' : 'rail-btn'}
              onClick={() => {
                setGlossOn((v) => !v);
                setActiveTerm(null);
              }}
              aria-pressed={glossOn}
            >
              AÇIKLAMA
            </button>
            <button type="button" className="rail-btn" onClick={() => run(() => api.generateTraffic())}>
              trafik üret
            </button>
            <button type="button" className="rail-btn" onClick={() => setOps(true)} aria-expanded={ops}>
              OPERASYON
            </button>
            {/* Belgeler kimlik istemez: düz bağlantı yeterli (render uçlarının aksine). */}
            <a className="rail-btn" href="/docs" target="_blank" rel="noopener">
              API
            </a>
            <a
              className="rail-btn"
              href="/llms-full.txt"
              target="_blank"
              rel="noopener"
              title="LLM ve kodlama ajanları için tam kılavuz"
            >
              LLM
            </a>
          </div>
        </header>

        {/* ── ZAMAN ŞERİDİ: sayfanın tek kesintisiz çizgisi ───────────────── */}
        <div className="timeline">
          <div className="tl-jumps">
            {/* Sıfırlama şeridin SOL ucundadır: "şimdi"ye dönmek soldadır. */}
            {offsetMs !== 0 && (
              <button
                type="button"
                className="jump reset"
                onClick={() => run(() => api.advanceClock({ reset: true }))}
              >
                sıfırla
              </button>
            )}
            {JUMPS.map((j) => (
              <button
                key={j.label}
                type="button"
                className="jump"
                style={{ left: `${pos(j.ms)}%` }}
                onClick={() => run(() => api.advanceClock({ advanceMs: j.ms }))}
                title={`Sanal saati ${j.label} ileri at`}
              >
                {j.label}
              </button>
            ))}
          </div>
          <div className="tl-line">
            <span className="tl-nowmark" aria-hidden="true" />
            {/* Bekleyen her adım kendi anına çakılı. */}
            {pending.map((p) => (
              <span
                key={p.id}
                className={open === p.id ? 'tl-ev on' : 'tl-ev'}
                style={{ left: `${pos(p.delta)}%` }}
                title={`${p.state} · ${deltaText(p.delta)}`}
                aria-hidden="true"
              />
            ))}
          </div>
          <div className="tl-scale">
            <span className="tl-now">ŞİMDİ</span>
            {TICKS.map((t) => (
              <span key={t.label} className="tl-tick" style={{ left: `${pos(t.ms)}%` }}>
                {t.label}
              </span>
            ))}
          </div>
        </div>

        {/* ── Sözlük şeridi: açıklama TALEP ÜZERİNE ───────────────────────── */}
        {glossOn && (
          <div className="gloss" role="region" aria-label="Terim açıklaması">
            {term || termCode ? (
              <>
                <span className="gloss-term">{activeTerm}</span>
                <span className="gloss-body">
                  {term?.short}
                  {term?.long && <span className="gloss-long">{term.long}</span>}
                  {termCode && termCode.notes.length > 0 && (
                    <span className="gloss-long">
                      {termCode.rules.join(' · ')} — {termCode.notes.join(' / ')}
                    </span>
                  )}
                  {term?.source && <span className="gloss-src">{term.source}</span>}
                </span>
                <button type="button" className="gloss-close" onClick={() => setActiveTerm(null)}>
                  kapat
                </button>
              </>
            ) : (
              <span className="gloss-hint">
                Açıklama katmanı açık — tahtadaki altı çizili terimlere basın.
              </span>
            )}
          </div>
        )}

        {/* ── İkaz bandı ──────────────────────────────────────────────────
            Burada iki paragraf açıklama duruyordu ve katlamanın üstünü yiyordu.
            "Yoğunluk varsayılan, açıklama TALEP ÜZERİNE" cevabı ilk görünümde
            çiğnenemez: bant tek satırdır, tam metin AÇIKLAMA katmanındadır. */}
        {!warnHidden && (
          <div className="notice" role="note">
            <span className="notice-mark" aria-hidden="true" />
            <button
              type="button"
              className="notice-item"
              onClick={() => {
                setGlossOn(true);
                setActiveTerm('ZİNCİR KASTEN GEÇERSİZ');
              }}
            >
              TEST SERTİFİKASI · ZİNCİR DOĞRULAMASI KASTEN BAŞARISIZ
            </button>
            <button
              type="button"
              className="notice-item"
              onClick={() => {
                setGlossOn(true);
                setActiveTerm('YÜZEY GEÇİCİ');
              }}
            >
              YÜZEY GEÇİCİ
            </button>
            <span className="notice-hint">basın — ayrıntı açıklama şeridinde</span>
            <button
              type="button"
              className="notice-hide"
              onClick={() => {
                setWarnHidden(true);
                localStorage.setItem(WARN_KEY, '1');
              }}
            >
              gizle
            </button>
          </div>
        )}
        {warnHidden && (
          <button
            type="button"
            className="warn-show"
            onClick={() => {
              setWarnHidden(false);
              localStorage.removeItem(WARN_KEY);
            }}
          >
            ikazları göster
          </button>
        )}

        {error && (
          <div className="err" role="alert">
            <span className="err-code">{error.errorCode}</span>
            <span>{error.reason}</span>
            {error.errors && (
              <ul>
                {error.errors.map((e) => (
                  <li key={e.field}>
                    <b>{e.field}</b> {e.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ── TAHTALAR ────────────────────────────────────────────────────── */}
        <main>
          <OutboundBoard documents={documents} ctl={ctl} inbox={inbox} />
          <InboundBoard inbox={inbox} ctl={ctl} />

          <div className="service">
            <Deliveries
              webhooks={webhooks}
              deliveries={deliveries}
              retryPolicy={retryPolicy}
              run={run}
            />
            <RequestLog requests={requests} />
          </div>
        </main>

        <footer className="foot">
          <span>
            MimMock — MimForge'un bugünkü davranışının simülatörü. Yarının geliştirici
            platformunun şartnamesi <b>değildir</b>.
          </span>
          <span className="dim">
            <Term k="CAS">CAS</Term> korumalı · gerçek GİB gönderimi yok
          </span>
        </footer>

        <OpsDrawer
          open={ops}
          onClose={() => setOps(false)}
          companies={companies}
          tokenRequired={health?.panelTokenRequired ?? false}
          token={token}
          setToken={setToken}
          refresh={refresh}
          onError={setError}
        />
      </div>
    </GlossaryContext.Provider>
  );
}
