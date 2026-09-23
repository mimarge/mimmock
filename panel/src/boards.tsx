/**
 * GİDEN ve GELEN tahtaları.
 *
 * İmza etkileşimi SATIR AÇILIMI'dır: satır menteşesinden ayrılır, altına tek
 * dikey zaman ekseni iner. Tahta "ne oldu" ve "sırada ne var" sorularını taşır;
 * "neden oldu" satırın İÇİNDEN açılır — uçuşa tıklayınca ayrıntı gelmesi gibi.
 */
import { Fragment, useEffect, useState } from 'react';
import { api, type DocumentEvent, type InboxDocument, type MockDocument } from './api.js';
import { Flip, Status, Term, deltaText, stampText } from './board.js';
import { RULES, codeGloss, stripEmphasis } from './glossary.js';
import { IconArrow, IconChain, IconHinge, IconSeal, MarkAnchor, MarkHeld } from './icons.js';

export interface BoardCtl {
  /** Sanal saat — bütün göreli süreler buna göre okunur. */
  now: Date;
  open: string | null;
  setOpen: (id: string | null) => void;
  run: (action: () => Promise<unknown>) => void;
  /** GELEN kutusundaki karşılığına atlamak için: kaynak belge kimliği eşlemesi. */
  chainTo?: (id: string) => void;
}

/* ── Ham GİB kodu hücresi ────────────────────────────────────────────────── */

function RawCode({ code }: { code: number | null }) {
  if (code === null) return <span className="dim">—</span>;
  // 🔑 1220 teslim çıpasıdır; çizilmiş işaret RENK OLMADAN da bunu söyler.
  const anchor = code === 1220;
  return (
    <Term k={String(code)}>
      <span className={anchor ? 'raw key' : 'raw'}>
        {anchor && <MarkAnchor size={11} />}
        <Flip text={String(code)} />
      </span>
    </Term>
  );
}

/* ── Zaman ekseni (satır açılımının gövdesi) ─────────────────────────────── */

function Axis({
  documentId,
  next,
  now,
}: {
  documentId: string;
  next: { state: string | null; at: string | null };
  now: Date;
}) {
  const [events, setEvents] = useState<DocumentEvent[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .documentHistory(documentId)
        .then((r) => alive && setEvents(r.events))
        .catch((e) => alive && setFailed((e as { reason?: string }).reason ?? 'okunamadı'));
    void load();
    const t = setInterval(load, 2000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [documentId]);

  if (failed) return <p className="dim">Olay geçmişi okunamadı: {failed}</p>;
  if (!events) return <p className="dim">Olay geçmişi okunuyor…</p>;
  if (events.length === 0)
    return <p className="dim">Henüz olay yok — belge tahtaya yeni girdi.</p>;

  return (
    <ol className="axis">
      {events.map((e, i) => {
        const rule = RULES.get(e.ruleId);
        /*
         * Eksen ZAMANI temsil eder, sırayı değil: iki olay arasında kayda değer
         * bir süre geçtiyse araya o süreyi taşıyan kesik bir parça girer.
         * Aksi hâlde 12 saniye ile 14 gün eksende aynı boşluğu kaplardı.
         */
        const gap =
          i > 0 ? new Date(e.at).getTime() - new Date(events[i - 1]!.at).getTime() : 0;
        return (
          <Fragment key={`${e.at}:${i}`}>
            {gap > 90_000 && (
              <li className="node gap" aria-hidden="true">
                <span className="node-time" />
                <span className="gap-line" />
                <span className="gap-label">{deltaText(gap).replace('+', '')} sonra</span>
              </li>
            )}
          <li className={e.rawGibCode === 1220 ? 'node key' : 'node'}>
            <span className="node-time">{stampText(e.at)}</span>
            <span className="node-dot" aria-hidden="true" />
            <span className="node-body">
              <span className="node-head">
                <Term k={e.ruleId}>
                  <span className="rule">{e.ruleId}</span>
                </Term>
                <span className="move">
                  {e.from ?? '—'} <IconArrow /> <b>{e.to ?? '—'}</b>
                </span>
                {e.rawGibCode !== null && (
                  <span className={e.rawGibCode === 1220 ? 'raw key' : 'raw'}>
                    {e.rawGibCode === 1220 && <MarkAnchor size={11} />}
                    ham <Term k={String(e.rawGibCode)}>{e.rawGibCode}</Term>
                    {e.rawGibCode === 1220 && <b className="anchor-word">BİRİNCİL</b>}
                  </span>
                )}
                {e.alarm && <span className="alarm">{e.alarm}</span>}
                {e.documentVersion !== null && <span className="dim">v{e.documentVersion}</span>}
              </span>
              {/* Kuralın kendi cümlesi — panelde YENİDEN YAZILMADI, tablodan okundu. */}
              {rule?.note &&
                (() => {
                  const { text, emphasised } = stripEmphasis(rule.note);
                  return (
                    <span className={emphasised ? 'node-note em' : 'node-note'}>{text}</span>
                  );
                })()}
              {rule?.source && <span className="node-src">{rule.source}</span>}
            </span>
          </li>
          </Fragment>
        );
      })}
      {/* Sırada ne var: eksenin açık ucu. Boş düğüm, henüz olmamış olay. */}
      <li className="node pending">
        <span className="node-time">
          {next.at ? stampText(next.at) : '—'}
        </span>
        <span className="node-dot open" aria-hidden="true" />
        <span className="node-body">
          <span className="node-head">
            {next.state ? (
              <>
                <span className="rule next">SIRADA</span>
                <span className="move">
                  <b>{next.state}</b>
                </span>
                {next.at && (
                  <span className="dim">{deltaText(new Date(next.at).getTime() - now.getTime())}</span>
                )}
              </>
            ) : (
              <>
                <span className="rule held">
                  <MarkHeld /> AÇIK BIRAKILDI
                </span>
                <Term k="POLL_DEADLINE">
                  <span className="dim">zarf kapanmadı — bu bir hata durumu değildir</span>
                </Term>
              </>
            )}
          </span>
        </span>
      </li>
    </ol>
  );
}

/**
 * SIRADA sütunu — "şimdi ne olacak" sorusunun tahtadaki karşılığı.
 *
 * Her durum kendi sözünü söyler. 🔴 "AÇIK" yalnız GERÇEKTEN askıda kalan belge
 * içindir: bir bekleme durumunda takılıp bir sonraki adımı olmayan belge.
 * `SEND_FAILED` askıda değildir — yeniden gönderme yolu AÇIKTIR (kural G15).
 */
const WAITING_STATUSES = new Set([
  'RECEIVED',
  'AWAITING_SIGNATURE',
  'AWAITING_NUMBERING',
  'PROCESSING',
  'SENT_TO_GIB',
]);

function NextCell({ doc, now }: { doc: MockDocument; now: Date }) {
  if (doc.engine.nextState && doc.engine.nextAt) {
    return (
      <>
        <Flip text={doc.engine.nextState} />{' '}
        <span className="dim">
          {deltaText(new Date(doc.engine.nextAt).getTime() - now.getTime())}
        </span>
      </>
    );
  }
  if (doc.status === 'SEND_FAILED') {
    return <span className="dim">yeniden gönderilebilir</span>;
  }
  if (doc.status === 'CANCELLED') return <span className="dim">iptal</span>;
  if (doc.deliveredAt || doc.status === 'REPORTED') return <span className="dim">tamam</span>;
  if (WAITING_STATUSES.has(doc.status)) {
    return (
      <Term k="POLL_DEADLINE">
        <span className="held-tag">
          <MarkHeld /> AÇIK
        </span>
      </Term>
    );
  }
  return <span className="dim">—</span>;
}

/* ── GİDEN tahtası ───────────────────────────────────────────────────────── */

const OUT_COLS = 8;

export function OutboundBoard({
  documents,
  ctl,
  inbox,
}: {
  documents: MockDocument[];
  ctl: BoardCtl;
  inbox: InboxDocument[];
}) {
  return (
    <section className="board-wrap" aria-labelledby="b-out">
      <div className="board-head">
        <h2 id="b-out">GİDEN</h2>
        <span className="count">
          <Flip text={String(documents.length)} /> belge
        </span>
      </div>
      {documents.length === 0 ? (
        <p className="empty">
          Tahta boş. <code>POST /v1/documents</code> (JSON) ya da{' '}
          <code>POST /v1/documents/ubl</code> (ham XML) ile belge gönderin — ya da
          rayın sağındaki <b>trafik üret</b> düğmesine basın.
        </p>
      ) : (
        <table className="board">
          <thead>
            <tr>
              <th className="c-no">BELGE NO</th>
              <th className="c-tip">TİP</th>
              <th className="c-vkn">ALICI</th>
              <th className="c-durum">DURUM</th>
              <th className="c-ham">HAM</th>
              <th className="c-imza">İMZA</th>
              <th className="c-sen">SENARYO</th>
              <th className="c-sira">SIRADA</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((d) => {
              const isOpen = ctl.open === d.id;
              const linked = inbox.find((i) => i.sourceDocumentId === d.id);
              return [
                /*
                 * 🔴 Satır `role="button"` DEĞİLDİR. Öyleyken satırın `row` rolü ve
                 * hücrelerin sütun-başlığı ilişkisi ekran okuyucudan siliniyordu —
                 * sekiz sütunluk bir tahtanın bütün okunma modeli. Açma kumandası
                 * ilk hücredeki GERÇEK düğmedir; satır tıklaması fare kolaylığıdır.
                 */
                <tr
                  key={d.id}
                  id={`doc-${d.id}`}
                  className={isOpen ? 'row open' : 'row'}
                  onClick={() => ctl.setOpen(isOpen ? null : d.id)}
                >
                  <td className="c-no">
                    <button
                      type="button"
                      className="hinge-btn"
                      aria-expanded={isOpen}
                      aria-controls={`detail-${d.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        ctl.setOpen(isOpen ? null : d.id);
                      }}
                    >
                      <IconHinge />
                      <Flip text={d.documentNumber ?? '——'} />
                    </button>
                  </td>
                  <td className="c-tip">{d.type}</td>
                  <td className="c-vkn">{d.receiverVkn ?? '—'}</td>
                  <td className="c-durum">
                    <Status value={d.status} />
                  </td>
                  <td className="c-ham">
                    <RawCode code={d.rawGibCode} />
                  </td>
                  <td className="c-imza">
                    {d.signature.kind === 'test-certificate' ? (
                      <Term k="TEST İMZASI">
                        <span className="seal">
                          <IconSeal /> TEST
                        </span>
                      </Term>
                    ) : (
                      <span className="dim">—</span>
                    )}
                  </td>
                  <td className="c-sen">{d.engine.scenario ?? '—'}</td>
                  <td className="c-sira">
                    <NextCell doc={d} now={ctl.now} />
                  </td>
                </tr>,
                isOpen ? (
                  <tr key={`${d.id}:detail`} id={`detail-${d.id}`} className="detail-row">
                    <td colSpan={OUT_COLS}>
                      <div className="expand">
                        <div className="detail">
                          <dl className="plate">
                            <div className="wide">
                              <dt>
                                <Term k="ETTN">ETTN</Term>
                              </dt>
                              <dd className="mono sel">{d.ettn}</dd>
                            </div>
                            <div>
                              <dt>Alıcı</dt>
                              <dd className="mono">{d.receiverVkn ?? '—'}</dd>
                            </div>
                            <div>
                              <dt>Tip / profil</dt>
                              <dd>
                                {d.type} · {d.profile ?? '—'}
                              </dd>
                            </div>
                            <div>
                              <dt>Tutar</dt>
                              <dd className="mono">
                                {d.payableAmount ?? '—'} {d.currencyCode ?? ''}
                              </dd>
                            </div>
                            <div>
                              <dt>Düzenleme</dt>
                              <dd className="mono">{d.issueDate}</dd>
                            </div>
                            <div>
                              <dt>Doğrulama</dt>
                              <dd className="mono">
                                {d.validation.appliedXsd ?? '—'} ·{' '}
                                {d.validation.appliedSchematron ?? '—'}
                              </dd>
                            </div>
                            <div>
                              <dt>Teslim</dt>
                              <dd className="mono">
                                {d.deliveredAt ? stampText(d.deliveredAt) : '—'}
                              </dd>
                            </div>
                          </dl>

                          <Axis
                            documentId={d.id}
                            now={ctl.now}
                            next={{ state: d.engine.nextState, at: d.engine.nextAt }}
                          />

                          {linked && ctl.chainTo && (
                            <button
                              type="button"
                              className="chain"
                              onClick={() => ctl.chainTo?.(linked.id)}
                            >
                              <IconChain /> alıcının kutusundaki karşılığı ·{' '}
                              {linked.documentNumber ?? linked.ettn.slice(0, 8)}
                            </button>
                          )}

                          <div className="acts">
                            <button type="button" onClick={() => ctl.run(() => api.openRender(d.id, 'html'))}>
                              HTML görüntü
                            </button>
                            <button type="button" onClick={() => ctl.run(() => api.openRender(d.id, 'pdf'))}>
                              PDF
                            </button>
                            <button type="button" onClick={() => ctl.run(() => api.advance(d.id))}>
                              bir adım ilerlet
                            </button>
                            <button type="button" onClick={() => ctl.run(() => api.injectFailure(d.id, 1230))}>
                              1230 — teslimi geri al
                            </button>
                            <button type="button" onClick={() => ctl.run(() => api.injectFailure(d.id, 1150))}>
                              1150 — hata
                            </button>
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
      )}
    </section>
  );
}

/* ── GELEN tahtası ───────────────────────────────────────────────────────── */

const IN_COLS = 6;

/** Tahtada gösterilen en fazla gelen satırı. */
const INBOX_LIMIT = 25;

export function InboundBoard({
  inbox,
  ctl,
}: {
  inbox: InboxDocument[];
  ctl: BoardCtl;
}) {
  return (
    <section className="board-wrap" aria-labelledby="b-in">
      <div className="board-head">
        <h2 id="b-in">GELEN</h2>
        <span className="count">
          <Flip text={String(inbox.length)} /> belge
          {inbox.length > INBOX_LIMIT && (
            /* Trafik üreteci durmadan üretir; tahta sonsuza uzamaz. */
            <span className="dim"> · en yeni {INBOX_LIMIT} satır gösteriliyor</span>
          )}
        </span>
      </div>
      {inbox.length === 0 ? (
        <p className="empty">
          Gelen belge yok. Tanımlı bir şirkete fatura kesin — teslim olunca alıcının
          kutusuna düşer — ya da <code>POST /v1/_sandbox/inbox</code> ile ham XML enjekte edin.
        </p>
      ) : (
        <table className="board">
          <thead>
            <tr>
              <th className="c-no">BELGE NO</th>
              <th className="c-vkn">GÖNDEREN</th>
              <th className="c-kay">KAYNAK</th>
              <th className="c-durum">DURUM</th>
              <th className="c-sapr">S_APR</th>
              <th className="c-yanit">YANIT</th>
            </tr>
          </thead>
          <tbody>
            {inbox.slice(0, INBOX_LIMIT).map((d) => {
              const isOpen = ctl.open === d.id;
              return [
                <tr
                  key={d.id}
                  id={`doc-${d.id}`}
                  className={isOpen ? 'row open' : 'row'}
                  onClick={() => ctl.setOpen(isOpen ? null : d.id)}
                >
                  <td className="c-no">
                    <button
                      type="button"
                      className="hinge-btn"
                      aria-expanded={isOpen}
                      aria-controls={`detail-${d.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        ctl.setOpen(isOpen ? null : d.id);
                      }}
                    >
                      <IconHinge />
                      <Flip text={d.documentNumber ?? '——'} />
                    </button>
                  </td>
                  <td className="c-vkn">{d.senderVkn ?? '—'}</td>
                  <td className="c-kay">
                    {/* 🔑 Üretilmiş trafik AÇIKÇA işaretli — kendi trafiğinizle karışmasın. */}
                    {d.generated ? (
                      <span className="gen">
                        ÜRETİLMİŞ<span className="gen-scen">{d.generatedScenario}</span>
                      </span>
                    ) : (
                      <span className="dim">{d.profile ?? '—'}</span>
                    )}
                  </td>
                  <td className="c-durum">
                    <Status value={d.status} />
                  </td>
                  <td className="c-sapr">
                    <Term k="S_APR">
                      {d.systemResponse.confirmedAt ? (
                        <span className="sapr ok">teyit {d.systemResponse.code}</span>
                      ) : d.systemResponse.sentAt ? (
                        <span className="sapr wait">gönderildi, teyit yok</span>
                      ) : (
                        <span className="dim">—</span>
                      )}
                    </Term>
                  </td>
                  <td className="c-yanit">
                    <Term k={d.replyStatus}>
                      <Flip text={d.replyStatus} />
                    </Term>
                  </td>
                </tr>,
                isOpen ? (
                  <tr key={`${d.id}:detail`} id={`detail-${d.id}`} className="detail-row">
                    <td colSpan={IN_COLS}>
                      <div className="expand">
                        <div className="detail">
                          <dl className="plate">
                            <div className="wide">
                              <dt>
                                <Term k="ETTN">ETTN</Term>
                              </dt>
                              <dd className="mono sel">{d.ettn}</dd>
                            </div>
                            <div>
                              <dt>Gönderen</dt>
                              <dd className="mono">{d.senderVkn ?? '—'}</dd>
                            </div>
                            <div>
                              <dt>Kaynak</dt>
                              <dd>
                                {d.generated ? `üretilmiş · ${d.generatedScenario ?? ''}` : (d.profile ?? '—')}
                              </dd>
                            </div>
                            <div>
                              <dt>Tutar</dt>
                              <dd className="mono">
                                {d.payableAmount ?? '—'} {d.currencyCode ?? ''}
                              </dd>
                            </div>
                            <div>
                              <dt>Yanıt kararı</dt>
                              <dd>{d.replyDecision ?? '—'}</dd>
                            </div>
                            <div>
                              <dt>Gerekçe</dt>
                              <dd>{d.replyReason ?? '—'}</dd>
                            </div>
                          </dl>

                          <Axis documentId={d.id} now={ctl.now} next={{ state: null, at: null }} />

                          {/*
                            Zincirin GELEN ucu: bu belge gönderenin tahtasındaki
                            hangi belgeden doğdu. Giden→gelen yönü listede duran
                            karşılığa bağlıdır; bu yön her zaman çalışır, çünkü
                            bağ belgenin kendi alanındadır.
                          */}
                          {d.sourceDocumentId && ctl.chainTo && (
                            <button
                              type="button"
                              className="chain"
                              onClick={() => ctl.chainTo?.(d.sourceDocumentId as string)}
                            >
                              <IconChain /> gönderenin tahtasındaki aslı
                            </button>
                          )}

                          <div className="acts">
                            {d.replyable.can ? (
                              <>
                                <button type="button" onClick={() => ctl.run(() => api.reply(d.id, 'ACCEPTED'))}>
                                  kabul et
                                </button>
                                <button
                                  type="button"
                                  onClick={() => ctl.run(() => api.reply(d.id, 'REJECTED', 'Panelden reddedildi'))}
                                >
                                  reddet
                                </button>
                              </>
                            ) : (
                              // Kapının SEBEBİ görünür: geliştirici neden yanıtlayamadığını bilir.
                              <p className="gate">
                                <Term k="DOCUMENT_NOT_SETTLED">
                                  Yanıt kapısı kapalı
                                </Term>
                                : {d.replyable.reason ?? '—'}
                              </p>
                            )}
                            <button type="button" onClick={() => ctl.run(() => api.openRender(d.id, 'html'))}>
                              HTML görüntü
                            </button>
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
      )}
    </section>
  );
}

/** Kod → kural notu; sözlük şeridi bunu kullanır. */
export { codeGloss };
