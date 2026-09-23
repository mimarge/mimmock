/**
 * `/healthz` — plan §2c çalıştırma sözleşmesi.
 * Durumu SESSİZ tutmaz: hangi sürücü, hangi şema, panel kapısı açık mı, kittest
 * bağlı mı — hepsi burada görünür (K4'ün "sessiz kip yok" ilkesi).
 */
import type { FastifyInstance } from 'fastify';
import { schemaFingerprint } from '../db/spec.js';
import type { AppDeps } from '../deps.js';

/**
 * `/healthz` yanıtının şekli — panel bunu `@shared` üzerinden TİP olarak içe alır.
 * Alan adı değişirse panelin tip denetimi kırmızıya döner (2026-09-23'te panel
 * lambası eski alanları okuyup sessizce "ERİŞİLEMİYOR" gösteriyordu).
 */
export interface HealthResponse {
  status: 'ok' | 'degraded';
  api: string;
  dialect: 'sqlite' | 'pg';
  schemaFingerprint: string;
  panelTokenRequired: boolean;
  panelAvailable: boolean;
  mimkit: { url: string | null; ready: boolean; offlineAllowed: boolean };
}

export function registerHealthRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get('/healthz', async (_request, reply): Promise<HealthResponse> => {
    // mimkit yoksa mock belge ALAMAZ — durum "degraded" olarak görünür
    // ve HTTP 503 döner. Yeşil görünüp sessizce düşük sadakatte çalışmak YOK (K4).
    const degraded = !deps.kittestReady;
    if (degraded) reply.code(503);
    return {
      status: degraded ? 'degraded' : 'ok',
      api: 'mimmock v1',
      dialect: deps.handle.dialect,
      schemaFingerprint: schemaFingerprint(),
      panelTokenRequired: deps.config.panelToken !== undefined,
      panelAvailable: deps.panelAvailable,
      /** Tek dış bağımlılık. `ready` hem erişimi hem anahtarı söyler. */
      mimkit: {
        url: deps.config.mimkitUrl ?? null,
        ready: deps.kittestReady,
        offlineAllowed: deps.config.allowOffline,
      },
    };
  });
}
