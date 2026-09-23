/** Giriş noktası — `docker run` bunu çağırır. */
import { loadConfig } from './config.js';
import { openDatabase } from './db/client.js';
import { createRepo } from './db/repo.js';
import { buildServerParts } from './server.js';
import { seedIfEmpty } from './seed.js';
import { createKittest, probeKittest, assertKittestReady } from './kittest/index.js';

const config = loadConfig();
const handle = await openDatabase({
  url: config.databaseUrl,
  sqlitePath: config.sqlitePath,
  autoReset: config.dbAutoReset,
});

/*
 * 🔴 K4 kapısı — AÇILIŞTA. mimkit hazır değilse (erişilemez ya da anahtar reddedildi) mock KALKMAZ ve sebebini
 * söyler. Sahte doğrulayıcıya düşen bir sandbox, geliştiriciye MimForge'un
 * reddedeceği belgeyi kabul ediyormuş gibi gösterirdi; bu sessiz yanlış, mock'un
 * tüm değerini götürür.
 */
const kittest = createKittest(config);
const probes = await probeKittest(kittest, config);
assertKittestReady(probes, config.allowOffline);
const kittestReady = probes.find((p) => p.name === 'mimkit')?.reachable === true;

if (config.seed) {
  const result = await seedIfEmpty(createRepo(handle), {
    selfUrl: `http://127.0.0.1:${config.port}`,
  });
  if (result.created) {
    console.log(
      `[mimmock] tohum veri yazıldı · kiracı anahtarı: ${result.tenantApiKey} · ` +
        `şirketler: ${result.companyVkns.join(', ')} · webhook: ${result.webhookUrl}`,
    );
  }
}

const { app, engine, dispatcher, traffic } = buildServerParts(config, handle, kittest, kittestReady);
// Motor tick'i: vadesi gelen belgeler ilerler. Durum DB'de olduğu için
// yeniden başlatma belgeleri dondurmaz (plan §5a-1).
engine.start(config.engineTickMs);

/*
 * Webhook kuyruğu ayrı bir tick'te boşalır. Motorla aynı döngüye koymak, yavaş
 * bir alıcının belge ilerleyişini geciktirmesi demekti — teslim, durumun önüne
 * geçmemeli.
 */
const dispatchTimer = setInterval(() => {
  void dispatcher.drain().catch(() => undefined);
}, config.engineTickMs);
dispatchTimer.unref();

/*
 * Trafik üreteci — plan §5b: "varsayılan düşük ama AÇIK; sandbox canlı hissettirmeli".
 * Ayrı bir döngü: üretim (ağ + doğrulama) belge akışını bekletmemeli.
 */
let trafficTimer: NodeJS.Timeout | null = null;
if (traffic && config.trafficEnabled) {
  const tenants = await createRepo(handle).listTenants();
  trafficTimer = setInterval(() => {
    void (async () => {
      for (const tenant of tenants) {
        const results = await traffic.run(tenant.id);
        const rejected = results.filter((r) => !r.valid);
        if (rejected.length > 0) {
          // 🔑 Üreteç bozulursa bu bir ERKEN UYARIDIR (plan §5b), sessiz kalmaz.
          app.log.warn(
            { rejected: rejected.map((r) => ({ scenario: r.scenario, errors: r.errors })) },
            'trafik üreteci: belge canlı doğrulayıcıdan GEÇEMEDİ',
          );
        }
      }
    })().catch(() => undefined);
  }, config.trafficIntervalMs);
  trafficTimer.unref();
  console.log(
    `[mimmock] trafik üreteci açık · tohum: ${config.trafficSeed} · ` +
      `her ${config.trafficIntervalMs / 1000} sn'de ${config.trafficBurst} belge`,
  );
}

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, 'kapanıyor');
  engine.stop();
  clearInterval(dispatchTimer);
  if (trafficTimer) clearInterval(trafficTimer);
  await app.close();
  await handle.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: config.port, host: config.host });
app.log.info(
  { dialect: handle.dialect, port: config.port, kittest: probes },
  'mimmock ayakta — bu yüzey GEÇİCİDİR, üretim yüzeyi ayrı duyurulacak (plan §0)',
);
