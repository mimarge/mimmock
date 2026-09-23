/**
 * Görüntü istemcisinin İSTEK GÖVDESİ — ağ istemez, sözleşmeyi sabitler.
 *
 * Buradaki en önemli satır `docType` beyanıdır. Ölçülmüş tuzak
 * (`@mimarge/mimkit` `types.d.ts:585-590`): `template` yolunda `docType`
 * isteğe bağlıdır ve verilmezse tür ŞABLONDAN okunur — yani e-Fatura çizdirip
 * e-Arşiv şablonunun id'sini vermek **sessizce** e-Arşiv görünümü üretir.
 * Sessiz yanlış görüntü, sandbox'ın önlemesi gereken şeylerin başında gelir.
 */
import { describe, it, expect } from 'vitest';
import { createRenderer, RenderUnavailableError, RenderRejectedError } from './render.js';

interface Captured {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function stub(response: { status: number; json?: unknown; bytes?: Buffer }) {
  const captured: Captured[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    captured.push({
      url: String(url),
      headers: (init.headers ?? {}) as Record<string, string>,
      body: init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
    });
    if (response.bytes) {
      return new Response(response.bytes, {
        status: response.status,
        headers: { 'content-type': 'application/pdf' },
      });
    }
    return new Response(JSON.stringify(response.json ?? {}), {
      status: response.status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { captured, fetchImpl };
}

const base = { url: 'http://kit.test', token: 't', scopeId: 'sc', timeoutMs: 1000 };
const htmlOk = { status: 200, json: { htmlBase64: Buffer.from('<html/>').toString('base64') } };

describe('görüntü isteği', () => {
  it('🔴 şablon SEÇİLMİŞSE `docType` AİDİYET BEYANI daima gider', async () => {
    const { captured, fetchImpl } = stub(htmlOk);
    const renderer = createRenderer({ ...base, fetchImpl });
    await renderer.html({
      xml: '<Invoice/>',
      docType: 'EFATURA',
      ownerTaxId: '1111111111',
      template: { id: 'tpl_1', version: 3 },
    });
    const template = captured[0]!.body.template as Record<string, unknown>;
    expect(template).toEqual({ id: 'tpl_1', version: 3, docType: 'EFATURA' });
  });

  it('şablon seçilmemişse `resolve` yoluna düşer', async () => {
    const { captured, fetchImpl } = stub(htmlOk);
    const renderer = createRenderer({ ...base, fetchImpl });
    await renderer.html({ xml: '<Invoice/>', docType: 'EARSIV', ownerTaxId: '1111111111' });
    expect(captured[0]!.body.resolve).toEqual({ docType: 'EARSIV' });
    expect(captured[0]!.body.template).toBeUndefined();
  });

  it('XML base64 olarak gönderilir, `output` doğru', async () => {
    const { captured, fetchImpl } = stub(htmlOk);
    const renderer = createRenderer({ ...base, fetchImpl });
    await renderer.html({ xml: '<Invoice>x</Invoice>', docType: 'EFATURA', ownerTaxId: '1' });
    const source = captured[0]!.body.source as { xmlBase64: string };
    expect(Buffer.from(source.xmlBase64, 'base64').toString('utf8')).toBe('<Invoice>x</Invoice>');
    expect(captured[0]!.body.output).toBe('html');
  });

  it('PDF yolunda `Accept: application/pdf` (ham baytlar)', async () => {
    const { captured, fetchImpl } = stub({ status: 200, bytes: Buffer.from('%PDF-1.4 ...') });
    const renderer = createRenderer({ ...base, fetchImpl });
    const result = await renderer.pdf({ xml: '<Invoice/>', docType: 'EFATURA', ownerTaxId: '1' });
    expect(captured[0]!.headers.accept).toBe('application/pdf');
    expect(captured[0]!.body.output).toBe('pdf');
    expect(result.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('scope ve mükellef başlıkları gider (bu uygulamada scope zorunlu)', async () => {
    const { captured, fetchImpl } = stub(htmlOk);
    const renderer = createRenderer({ ...base, fetchImpl });
    await renderer.html({ xml: '<x/>', docType: 'EFATURA', ownerTaxId: '9999999999' });
    expect(captured[0]!.headers['x-owner-tax-id']).toBe('9999999999');
    expect(captured[0]!.headers['x-scope-id']).toBe('sc');
  });

  it('scope verilmemişse mükellefin kendisi kapsam olur', async () => {
    const { captured, fetchImpl } = stub(htmlOk);
    const renderer = createRenderer({ ...base, scopeId: undefined, fetchImpl });
    await renderer.html({ xml: '<x/>', docType: 'EFATURA', ownerTaxId: '1111111111' });
    expect(captured[0]!.headers['x-scope-id']).toBe('1111111111');
  });

  it.each([500, 503, 408, 429])('%i → ALTYAPI hatası', async (status) => {
    const { fetchImpl } = stub({ status });
    const renderer = createRenderer({ ...base, fetchImpl });
    await expect(
      renderer.html({ xml: '<x/>', docType: 'EFATURA', ownerTaxId: '1' }),
    ).rejects.toBeInstanceOf(RenderUnavailableError);
  });

  it('4xx → istek reddi, iş kodu okunur', async () => {
    const { fetchImpl } = stub({
      status: 400,
      json: { error: { code: 'TEMPLATE_DOCTYPE_MISMATCH', message: 'tür uyuşmuyor' } },
    });
    const renderer = createRenderer({ ...base, fetchImpl });
    await expect(
      renderer.html({ xml: '<x/>', docType: 'EFATURA', ownerTaxId: '1' }),
    ).rejects.toMatchObject({ name: 'RenderRejectedError', code: 'TEMPLATE_DOCTYPE_MISMATCH' });
  });

  it('boş PDF altyapı hatası sayılır (sessizce boş dosya verilmez)', async () => {
    const { fetchImpl } = stub({ status: 200, bytes: Buffer.alloc(0) });
    const renderer = createRenderer({ ...base, fetchImpl });
    await expect(
      renderer.pdf({ xml: '<x/>', docType: 'EFATURA', ownerTaxId: '1' }),
    ).rejects.toBeInstanceOf(RenderUnavailableError);
  });

  it('`htmlBase64` yoksa altyapı hatası', async () => {
    const { fetchImpl } = stub({ status: 200, json: { watermarkApplied: false } });
    const renderer = createRenderer({ ...base, fetchImpl });
    await expect(
      renderer.html({ xml: '<x/>', docType: 'EFATURA', ownerTaxId: '1' }),
    ).rejects.toBeInstanceOf(RenderUnavailableError);
  });
});
