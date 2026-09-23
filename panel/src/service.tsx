/**
 * Servis bandı — tahtanın altındaki teknik şerit.
 *
 * İki şey: webhook teslimleri ve HAM İSTEK GÜNLÜĞÜ. İkincisi planın "🔑" ile
 * işaretlediği maddedir — *geliştirici ne gönderdi, biz ne döndük* — ve çoğu
 * sandbox'ta yoktur. Tahtadan farklı malzemede durur: daha sıkı satır, daha
 * küçük punto, sarı bant yok. Burası tahta değil, tahtanın arkası.
 */
import { useState } from 'react';
import { api, type Delivery, type RequestLogEntry, type Webhook } from './api.js';
import { Flip, Term, stampText } from './board.js';
import { MarkDelivered, MarkFailed, MarkHeld, MarkTransit } from './icons.js';

/** Teslim durumunun çizilmiş işareti. Sözcük ve renk yalnız başına yetmez. */
function DeliveryMark({ status }: { status: string }) {
  if (status === 'delivered') return <MarkDelivered size={11} />;
  if (status === 'dead') return <MarkFailed size={11} />;
  if (status === 'pending') return <MarkTransit size={11} />;
  return <MarkHeld size={11} />;
}

export function Deliveries({
  webhooks,
  deliveries,
  retryPolicy,
  run,
}: {
  webhooks: Webhook[];
  deliveries: Delivery[];
  retryPolicy: { delaysMs: number[]; maxAttempts: number } | null;
  run: (a: () => Promise<unknown>) => void;
}) {
  const hook = webhooks[0];
  return (
    <section className="strip" aria-labelledby="s-hook">
      <div className="strip-head">
        <h3 id="s-hook">WEBHOOK TESLİMLERİ</h3>
        {retryPolicy && (
          <span className="dim">
            geri çekilme {retryPolicy.delaysMs.map((d) => `${d / 1000}s`).join(' → ')} · en çok{' '}
            {retryPolicy.maxAttempts} deneme, sonra <Term k="ölü mektup">ölü mektup</Term>
          </span>
        )}
      </div>
      {hook && (
        <p className="hook-line">
          <span className="dim">alıcı</span> <code className="sel">{hook.url}</code>{' '}
          <span className="dim">anahtar</span> <code className="sel">{hook.secret}</code>
        </p>
      )}
      {deliveries.length === 0 ? (
        <p className="empty sm">Henüz teslim yok. Bir belgeyi ilerletin.</p>
      ) : (
        <div className="table-scroll">
          <table className="ledger hooks">
          <thead>
            <tr>
              <th>#</th>
              <th>OLAY</th>
              <th>DURUM</th>
              <th>DENEME</th>
              <th>HTTP</th>
              <th>HATA</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {deliveries.slice(0, 15).map((d) => (
              <tr key={d.id}>
                <td className="mono">{d.sequence}</td>
                <td className="mono">{d.event}</td>
                <td>
                  {/*
                    🔴 Renk tek taşıyıcı değildir — tahtada olduğu gibi defterde de.
                    Teslim durumu yalnız yeşil/kırmızı ile ayrılıyordu.
                  */}
                  <span className={`pill ${d.status}`}>
                    <DeliveryMark status={d.status} />
                    <Flip text={d.status} />
                  </span>
                </td>
                <td className="mono">
                  {d.attempt}/{d.maxAttempts}
                </td>
                <td className="mono dim">{d.httpStatus ?? '—'}</td>
                <td className="clip dim" title={d.error ?? undefined}>
                  {d.error ?? '—'}
                </td>
                <td>
                  {/* Elle yeniden gönderme — ölü mektuptan da çalışır. */}
                  <button type="button" onClick={() => run(() => api.replayDelivery(d.webhookId, d.id))}>
                    yeniden gönder
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function RequestLog({ requests }: { requests: RequestLogEntry[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const rows = errorsOnly ? requests.filter((r) => r.status >= 400) : requests;

  return (
    <section className="strip" aria-labelledby="s-req">
      <div className="strip-head">
        <h3 id="s-req">HAM İSTEK GÜNLÜĞÜ</h3>
        <label className="toggle sm">
          <input
            type="checkbox"
            checked={errorsOnly}
            onChange={(e) => setErrorsOnly(e.target.checked)}
          />
          <span>yalnız hatalar</span>
        </label>
      </div>
      {rows.length === 0 ? (
        <p className="empty sm">
          {errorsOnly ? 'Hatalı istek yok.' : 'Henüz istek yok. Bir uç çağırın.'}
        </p>
      ) : (
        <div className="table-scroll">
          <table className="ledger reqs">
          <thead>
            <tr>
              <th>SAAT</th>
              <th>YÖNTEM</th>
              <th>UÇ</th>
              <th>KOD</th>
              <th>SÜRE</th>
              <th>HATA</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isOpen = open === r.id;
              return [
                <tr
                  key={r.id}
                  className={isOpen ? 'row open' : 'row'}
                  onClick={() => setOpen(isOpen ? null : r.id)}
                >
                  <td className="mono dim">
                    {/* Açma kumandası gerçek düğmedir; satır `row` rolünü korur. */}
                    <button
                      type="button"
                      className="hinge-btn"
                      aria-expanded={isOpen}
                      aria-controls={`req-${r.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpen(isOpen ? null : r.id);
                      }}
                    >
                      {stampText(r.at)}
                    </button>
                  </td>
                  <td className="mono method">{r.method}</td>
                  <td className="mono clip" title={r.url}>
                    {r.url}
                  </td>
                  <td className={r.status >= 400 ? 'mono bad' : 'mono'}>{r.status}</td>
                  <td className="mono dim">{r.durationMs}ms</td>
                  <td className="mono dim clip">{r.errorCode ?? '—'}</td>
                </tr>,
                isOpen ? (
                  <tr key={`${r.id}:b`} id={`req-${r.id}`} className="detail-row">
                    <td colSpan={6}>
                      <div className="expand">
                        <div className="raw-pair">
                          <div>
                            <h4>İSTEK</h4>
                            <pre className="sel">
                              {Object.entries(r.requestHeaders)
                                .map(([k, v]) => `${k}: ${v}`)
                                .join('\n')}
                              {r.requestBody ? `\n\n${r.requestBody}` : '\n\n(gövde yok)'}
                            </pre>
                          </div>
                          <div>
                            <h4>YANIT</h4>
                            <pre className="sel">{r.responseBody ?? '(gövde yok)'}</pre>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null,
              ];
            })}
          </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
