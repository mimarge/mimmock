import type { AppConfig } from './config.js';
import type { DbHandle } from './db/client.js';
import type { Repo } from './db/repo.js';
import type { Kittest } from './kittest/index.js';
import type { Engine } from './engine/engine.js';
import type { Clock } from './engine/clock.js';
import type { Dispatcher } from './webhooks/dispatcher.js';
import type { TrafficGenerator } from './traffic/generator.js';

export interface AppDeps {
  config: AppConfig;
  handle: DbHandle;
  repo: Repo;
  kittest: Kittest;
  kittestReady: boolean;
  engine: Engine;
  clock: Clock;
  dispatcher: Dispatcher;
  /** Trafik üreteci — mimkit hazır değilse `null` (gerçek UBL üretilemez). */
  traffic: TrafficGenerator | null;
  panelAvailable: boolean;
}
