/**
 * Operasyon çekmecesi — tahtanın arkası.
 *
 * Şirket tanımı sürekli açık bir ekranda görünmesi gereken bir şey değildir;
 * kurulum işidir, günlük okuma işi değil. O yüzden tahtada yer kaplamaz, rayın
 * sağından çekmece olarak gelir.
 */
import { useState } from 'react';
import { api, INVOICE_PROFILE_IDS, setPanelToken, type ApiError, type Company } from './api.js';

const EMPTY = {
  vkn: '',
  title: '',
  addressStreet: '',
  addressDistrict: '',
  addressCity: '',
  addressCountry: 'Türkiye',
  taxOffice: '',
  pkAliases: '',
  gbAliases: '',
  seriesPrefix: '',
  eInvoiceRegistered: true,
  profiles: ['TEMELFATURA'] as string[],
};

export function OpsDrawer({
  open,
  onClose,
  companies,
  tokenRequired,
  token,
  setToken,
  refresh,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  companies: Company[];
  tokenRequired: boolean;
  token: string;
  setToken: (t: string) => void;
  refresh: () => Promise<void>;
  onError: (e: ApiError | null) => void;
}) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    onError(null);
    try {
      await api.createCompany({
        vkn: form.vkn.trim(),
        title: form.title.trim(),
        addressStreet: form.addressStreet || undefined,
        addressDistrict: form.addressDistrict || undefined,
        addressCity: form.addressCity || undefined,
        addressCountry: form.addressCountry,
        taxOffice: form.taxOffice || undefined,
        pkAliases: form.pkAliases.split(',').map((s) => s.trim()).filter(Boolean),
        gbAliases: form.gbAliases.split(',').map((s) => s.trim()).filter(Boolean),
        profiles: form.profiles,
        seriesPrefix: form.seriesPrefix || undefined,
        eInvoiceRegistered: form.eInvoiceRegistered,
      });
      setForm(EMPTY);
      await refresh();
    } catch (e) {
      onError(e as ApiError);
    } finally {
      setBusy(false);
    }
  };

  const toggleProfile = (p: string) =>
    setForm((f) => ({
      ...f,
      profiles: f.profiles.includes(p) ? f.profiles.filter((x) => x !== p) : [...f.profiles, p],
    }));

  return (
    <div className={open ? 'drawer open' : 'drawer'} aria-hidden={!open}>
      <div className="drawer-head">
        <h2>OPERASYON</h2>
        <button type="button" className="close" onClick={onClose} aria-label="Çekmeceyi kapat">
          kapat
        </button>
      </div>

      <div className="drawer-body">
        {tokenRequired && (
          <label className="field">
            <span>Panel token</span>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onBlur={() => {
                setPanelToken(token);
                void refresh();
              }}
            />
          </label>
        )}

        <h3>Tanımlı şirketler ({companies.length})</h3>
        {companies.length === 0 ? (
          <p className="empty sm">Henüz şirket yok. Aşağıdan tanımlayın.</p>
        ) : (
          <div className="table-scroll">
            <table className="ledger firms">
            <thead>
              <tr>
                <th>VKN/TCKN</th>
                <th>UNVAN</th>
                <th>PK/GB</th>
                <th>SİCİL</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.vkn}>
                  <td className="mono sel">{c.vkn}</td>
                  <td className="clip">{c.title}</td>
                  <td className="mono dim">
                    {c.aliases.pk.length}/{c.aliases.gb.length}
                  </td>
                  <td className="dim">{c.eInvoiceRegistered ? 'e-Fatura' : 'e-Arşiv'}</td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        )}

        <h3>Yeni şirket</h3>
        <form onSubmit={submit}>
          <div className="fields">
            <label className="field">
              <span>VKN / TCKN</span>
              <input
                value={form.vkn}
                onChange={(e) => setForm({ ...form, vkn: e.target.value })}
                placeholder="10 veya 11 hane"
                inputMode="numeric"
              />
            </label>
            <label className="field">
              <span>Unvan</span>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label className="field">
              <span>Vergi dairesi</span>
              <input value={form.taxOffice} onChange={(e) => setForm({ ...form, taxOffice: e.target.value })} />
            </label>
            <label className="field">
              <span>Sokak</span>
              <input value={form.addressStreet} onChange={(e) => setForm({ ...form, addressStreet: e.target.value })} />
            </label>
            <label className="field">
              <span>İlçe</span>
              <input value={form.addressDistrict} onChange={(e) => setForm({ ...form, addressDistrict: e.target.value })} />
            </label>
            <label className="field">
              <span>İl</span>
              <input value={form.addressCity} onChange={(e) => setForm({ ...form, addressCity: e.target.value })} />
            </label>
            <label className="field wide">
              <span>PK etiketleri (virgülle)</span>
              <input
                value={form.pkAliases}
                onChange={(e) => setForm({ ...form, pkAliases: e.target.value })}
                placeholder="urn:mail:defaultpk@…"
              />
            </label>
            <label className="field wide">
              <span>GB etiketleri (virgülle)</span>
              <input
                value={form.gbAliases}
                onChange={(e) => setForm({ ...form, gbAliases: e.target.value })}
                placeholder="urn:mail:defaultgb@…"
              />
            </label>
            <label className="field">
              <span>Seri öneki</span>
              <input
                value={form.seriesPrefix}
                onChange={(e) => setForm({ ...form, seriesPrefix: e.target.value })}
                placeholder="ABC"
              />
            </label>
          </div>

          <fieldset>
            <legend>Profil yetenekleri</legend>
            <div className="chips">
              {INVOICE_PROFILE_IDS.map((p) => (
                <label key={p} className={form.profiles.includes(p) ? 'chip on' : 'chip'}>
                  <input type="checkbox" checked={form.profiles.includes(p)} onChange={() => toggleProfile(p)} />
                  <span>{p}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="toggle">
            <input
              type="checkbox"
              checked={form.eInvoiceRegistered}
              onChange={(e) => setForm({ ...form, eInvoiceRegistered: e.target.checked })}
            />
            <span>e-Fatura sicilinde kayıtlı — değilse belgeler e-Arşiv yoluna düşer</span>
          </label>

          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Kaydediliyor…' : 'Şirketi tanımla'}
          </button>
        </form>
      </div>
    </div>
  );
}
