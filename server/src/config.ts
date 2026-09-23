/**
 * Çalıştırma yapılandırması — env ADLARI public, DEĞERLER asla (plan §2b).
 */
import { resolve } from 'node:path';

export interface AppConfig {
  /** Plan §2c: 8088 bilinçli — MimForge yığınında 8080 Temporal UI'dır. */
  port: number;
  host: string;
  /** Boş → gömülü SQLite. `postgres://…` → dış PG (K3). */
  databaseUrl: string | undefined;
  /** SQLite dosyası (databaseUrl boşken). */
  sqlitePath: string;
  /** Şema parmak izi uyuşmazlığında veriyi sil ve yeniden kur. */
  dbAutoReset: boolean;
  /** Panel kimliği: tek token (K14). Boşsa panel açık (yerel sandbox). */
  panelToken: string | undefined;
  /** Tohum veri yaz (K13). */
  seed: boolean;
  /** Panel derleme çıktısı; yoksa panel sunulmaz. */
  panelDistDir: string;
  logLevel: string;

  /*
   * mimkit — TEK dış bağımlılık (plan K4: CANLI doğrulama + numaralama + görüntü).
   * Env adları MimForge'dan ölçüldü (`docs/m2-olcum-kittest-sozlesmesi.md` §3):
   * MIMKIT_URL → MIMMOCK_MIMKIT_URL, MIMKIT_TOKEN → MIMMOCK_MIMKIT_TOKEN.
   */
  mimkitUrl: string | undefined;
  mimkitToken: string | undefined;
  mimkitScopeId: string | undefined;
  mimkitTimeoutMs: number;
  /** K4 kapısını bilerek açar; mock belge ALAMAZ ve bunu yüksek sesle söyler. */
  allowOffline: boolean;
  /** Motor tick aralığı (ms) — vadesi gelen geçişler bu sıklıkta uygulanır. */
  engineTickMs: number;

  /*
   * Trafik üreteci (plan K16/§5b).
   * *"Hız ayarlanabilir, varsayılan düşük ama AÇIK — sandbox canlı hissettirmeli."*
   */
  trafficEnabled: boolean;
  /** Aynı tohum aynı trafiği verir; geliştirici hatayı yeniden üretebilsin. */
  trafficSeed: string;
  trafficIntervalMs: number;
  /** Her turda kaç belge. */
  trafficBurst: number;
}

/**
 * 🔴 Verilen ortamdan okur. Eskiden `process.env`'den okuyordu: `loadConfig(env)`
 * ile verilen `MIMMOCK_ALLOW_OFFLINE` gibi bayraklar sessizce yok sayılıyordu.
 */
function envFlag(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw === '1' || raw.toLowerCase() === 'true';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const dataDir = env.MIMMOCK_DATA_DIR ?? './data';
  return {
    port: Number(env.MIMMOCK_PORT ?? 8088),
    host: env.MIMMOCK_HOST ?? '0.0.0.0',
    databaseUrl: env.MIMMOCK_DB || undefined,
    sqlitePath: env.MIMMOCK_SQLITE_PATH ?? resolve(dataDir, 'mimmock.db'),
    dbAutoReset: envFlag(env, 'MIMMOCK_DB_AUTO_RESET', false),
    panelToken: env.MIMMOCK_PANEL_TOKEN || undefined,
    seed: envFlag(env, 'MIMMOCK_SEED', true),
    panelDistDir: env.MIMMOCK_PANEL_DIST ?? resolve(import.meta.dirname, '../../panel/dist'),
    logLevel: env.MIMMOCK_LOG_LEVEL ?? 'info',

    mimkitUrl: env.MIMMOCK_MIMKIT_URL || undefined,
    mimkitToken: env.MIMMOCK_MIMKIT_TOKEN || undefined,
    mimkitScopeId: env.MIMMOCK_MIMKIT_SCOPE_ID || undefined,
    // Doğrulama da bu süreyi kullanır; büyük UBL'ler için 30 sn.
    mimkitTimeoutMs: Number(env.MIMMOCK_MIMKIT_TIMEOUT_MS ?? 30000),
    allowOffline: envFlag(env, 'MIMMOCK_ALLOW_OFFLINE', false),
    engineTickMs: Number(env.MIMMOCK_ENGINE_TICK_MS ?? 1000),

    trafficEnabled: envFlag(env, 'MIMMOCK_TRAFFIC_ENABLED', true),
    trafficSeed: env.MIMMOCK_TRAFFIC_SEED ?? 'mimmock',
    // Varsayılan düşük: 2 dakikada bir tek belge. Sandbox canlı ama gürültülü değil.
    trafficIntervalMs: Number(env.MIMMOCK_TRAFFIC_INTERVAL_MS ?? 120_000),
    trafficBurst: Number(env.MIMMOCK_TRAFFIC_BURST ?? 1),
  };
}
