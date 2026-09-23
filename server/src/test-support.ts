/** Test yardımcıları — tek yerde, testler arası kopya olmasın. */
import { openDatabase, type DbHandle } from './db/client.js';
import { createRepo, type Repo } from './db/repo.js';
import { buildServerParts } from './server.js';
import { loadConfig, type AppConfig } from './config.js';
import { seedIfEmpty } from './seed.js';
import { createKittest, probeKittest } from './kittest/index.js';
import type { FastifyInstance } from 'fastify';
import type { Engine } from './engine/engine.js';
import type { Clock } from './engine/clock.js';
import type { Dispatcher } from './webhooks/dispatcher.js';
import type { TrafficGenerator } from './traffic/generator.js';

export interface TestApp {
  app: FastifyInstance;
  handle: DbHandle;
  repo: Repo;
  engine: Engine;
  clock: Clock;
  dispatcher: Dispatcher;
  traffic: TrafficGenerator | null;
  routes: ReadonlyArray<{ method: string; url: string }>;
  apiKey: string;
  kittestReady: boolean;
  close(): Promise<void>;
}

/**
 * Canlı mimkit bağlantısı — testler için. `MIMMOCK_TEST_MIMKIT_URL` + `_TOKEN`.
 * Yoksa `undefined`: canlı testler ATLANMAZ, düşer (atlanan test = ölçülmemiş).
 * Dönen nesne doğrudan `startTestApp({ env })`'e verilir.
 */
export function testMimkitEnv(): { MIMMOCK_MIMKIT_URL: string; MIMMOCK_MIMKIT_TOKEN: string } | undefined {
  const url = process.env.MIMMOCK_TEST_MIMKIT_URL;
  const token = process.env.MIMMOCK_TEST_MIMKIT_TOKEN;
  if (!url || !token) return undefined;
  return { MIMMOCK_MIMKIT_URL: url, MIMMOCK_MIMKIT_TOKEN: token };
}

/** Canlı testlerin ortak hata mesajı — ölçülmeden yeşil sayılmaz. */
export const LIVE_REQUIRED = 'MIMMOCK_TEST_MIMKIT_URL + MIMMOCK_TEST_MIMKIT_TOKEN gerekli (canlı mimkit)';

/**
 * `MIMMOCK_TEST_PG` ayarlıysa PG'ye, değilse bellek-içi SQLite'a bağlanır.
 * Aynı test gövdesi iki sürücüde koşar (M1 ölçüsü: "PG'ye geçince aynı şema").
 */
export async function startTestApp(options?: {
  url?: string | undefined;
  seed?: boolean;
  env?: Partial<NodeJS.ProcessEnv>;
}): Promise<TestApp> {
  const config: AppConfig = {
    ...loadConfig({ ...process.env, ...options?.env } as NodeJS.ProcessEnv),
    port: 0,
    databaseUrl: options?.url,
    sqlitePath: ':memory:',
    dbAutoReset: true,
    seed: options?.seed ?? true,
    // Testlerde trafik döngüsü KAPALI: üretimi testin kendisi tetikler.
    trafficEnabled: false,
    panelDistDir: '/nonexistent-panel-dist',
    logLevel: 'silent',
  };

  const handle = await openDatabase({
    url: config.databaseUrl,
    sqlitePath: config.sqlitePath,
    autoReset: config.dbAutoReset,
  });

  // PG'de önceki koşumdan veri kalmış olabilir; testler temiz başlar.
  if (handle.dialect === 'pg') {
    const { dropSchemaStatements } = await import('./db/ddl.js');
    for (const statement of dropSchemaStatements('pg')) await handle.execRaw(statement);
    const { createSchemaStatements } = await import('./db/ddl.js');
    for (const statement of createSchemaStatements('pg')) await handle.execRaw(statement);
  }

  const repo = createRepo(handle);
  let apiKey = '';
  if (config.seed) apiKey = (await seedIfEmpty(repo)).tenantApiKey;

  // mimkit: gerçek adres verilmişse gerçek servise, verilmemişse erişilemez
  // sayılır. Testler bunu bilerek kullanır — "çevrimdışıyken ne olur" da bir kapıdır.
  const kittest = createKittest(config);
  const probes = await probeKittest(kittest, config);
  const kittestReady = probes.find((p) => p.name === 'mimkit')?.reachable === true;

  const { app, engine, clock, dispatcher, traffic, routes } = buildServerParts(
    config, handle, kittest, kittestReady,
  );
  await app.ready();

  return {
    app,
    handle,
    repo,
    engine,
    clock,
    dispatcher,
    traffic,
    routes,
    apiKey,
    kittestReady,
    async close() {
      engine.stop();
      await app.close();
      await handle.close();
    },
  };
}

/** Testlerin iki sürücüde de koşması için: [ad, url] çiftleri. */
export function driverMatrix(): Array<[string, string | undefined]> {
  const matrix: Array<[string, string | undefined]> = [['sqlite', undefined]];
  const pgUrl = process.env.MIMMOCK_TEST_PG;
  if (pgUrl) matrix.push(['pg', pgUrl]);
  return matrix;
}
