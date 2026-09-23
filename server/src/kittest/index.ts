/**
 * mimkit bağlantısı ve AÇILIŞ KAPISI.
 *
 * MimMock'un TEK dış bağımlılığı mimkit'tir: doğrulama (XSD + şematron), numaralama
 * ve görüntü aynı servisten gelir. MimForge'da da doğrulamanın birincil yolu
 * mimkit'tir (`packages/ubl-validate`).
 *
 * 🔴 Plan K4: *"Ağ yoksa mock KALKMAZ ve hata mesajı bunu net söyler (sessiz
 * düşük-sadakat kipi YOK)."* Sahte doğrulayıcıya düşen bir mock, geliştiriciye
 * MimForge'un kabul etmeyeceği belgeyi kabul ediyormuş gibi görünür — sandbox'ın
 * tüm değeri o an kaybolur.
 */
import { createValidator, type Validator } from './validate.js';
import { createNumbers, type Numbers } from './numbers.js';
import { createRenderer, type Renderer } from './render.js';
import type { AppConfig } from '../config.js';

/** mimkit anahtarı talebi — README, `.env.example` ve hata mesajları bunu gösterir. */
export const MIMKIT_KEY_REQUEST = 'mimkit adresi ve anahtarı için bilgi@mimsoft.com.tr adresine e-posta gönderin';

export interface Kittest {
  validator: Validator;
  /** Adres/anahtar yoksa (çevrimdışı kip) `null`. */
  numbers: Numbers | null;
  /** Görüntü (şablon) — doğrulamayla AYNI mimkit örneği. */
  renderer: Renderer | null;
}

export interface KittestProbe {
  name: string;
  url: string;
  reachable: boolean;
  /** Erişilemediyse ya da anahtar reddedildiyse NEDEN. */
  detail: string;
}

export function createKittest(config: AppConfig): Kittest {
  const shared = {
    url: config.mimkitUrl ?? '',
    token: config.mimkitToken ?? '',
    timeoutMs: config.mimkitTimeoutMs,
  };
  const configured = Boolean(config.mimkitUrl);
  return {
    validator: createValidator(shared),
    numbers: configured ? createNumbers({ ...shared, scopeId: config.mimkitScopeId }) : null,
    renderer: configured ? createRenderer({ ...shared, scopeId: config.mimkitScopeId }) : null,
  };
}

/**
 * Açılış sondası. Doğrulama ucunu kimlikle birlikte sınar: `/healthz` anahtar
 * denetlemediği için "ayakta ama anahtarınız geçersiz" durumu ancak böyle görünür.
 */
export async function probeKittest(kittest: Kittest, config: AppConfig): Promise<KittestProbe[]> {
  const readiness = await kittest.validator.readiness();
  return [
    {
      name: 'mimkit',
      url: config.mimkitUrl ?? '',
      reachable: readiness.ready,
      detail: readiness.detail,
    },
  ];
}

export function assertKittestReady(probes: KittestProbe[], allowOffline: boolean): void {
  const mimkit = probes.find((p) => p.name === 'mimkit');
  if (mimkit?.reachable) return;

  const message =
    `mimkit hazır değil — ${(mimkit?.detail ?? 'sonda yok').replace(/[.\s]+$/, '')}. ` +
    `MimMock belgeyi kendisi doğrulamaz; şema/şematron CANLI mimkit'ten gelir (plan K4), ` +
    `çünkü sahte bir doğrulayıcı size MimForge'un REDDEDECEĞİ belgeyi kabul ediyormuş gibi ` +
    `gösterir. MIMMOCK_MIMKIT_URL ve MIMMOCK_MIMKIT_TOKEN değerlerini kontrol edin ` +
    `(${MIMKIT_KEY_REQUEST}). Bilerek çevrimdışı çalışacaksanız MIMMOCK_ALLOW_OFFLINE=1 ` +
    `verin — o kipte belge ALMA uçları 503 döner ve /healthz durumu "degraded" olur.`;

  if (!allowOffline) throw new Error(message);
  // eslint-disable-next-line no-console
  console.warn(`[mimmock] ÇEVRİMDIŞI KİP — ${message}`);
}

export { ValidatorUnavailableError, ValidatorBadRequestError } from './validate.js';
export { NumberingUnavailableError, NumberingRejectedError } from './numbers.js';
export type { ValidateResult, SchematronError } from './validate.js';
export type { Reservation } from './numbers.js';
export { RenderUnavailableError, RenderRejectedError } from './render.js';
export type { RenderedHtml, RenderedPdf, TemplateSummary } from './render.js';
