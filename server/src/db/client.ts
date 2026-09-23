/**
 * Sürücü seçimi — gömülü SQLite (varsayılan) veya `MIMMOCK_DB` ile dış PG (K3).
 *
 * 🔑 Kural: lehçe ayrışması YALNIZ bu dosyadaki fabrikada yaşar. Sorgu yazan
 * hiçbir yerde `if (dialect === 'pg')` bulunmaz — yukarısı tek bir tip görür.
 * Daraltma (`as`) iki noktada ve gerekçelidir; doğruluğu `dual-driver` testiyle
 * sınanır: aynı repo kodu iki sürücüde koşar, aynı sonucu verir.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import { drizzle as drizzleSqlite, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as sqliteTables from './dialects/sqlite.generated.js';
import * as pgTables from './dialects/pg.generated.js';
import { createSchemaStatements, dropSchemaStatements, SCHEMA_META_TABLE, type SqlDialect } from './ddl.js';
import { schemaFingerprint } from './spec.js';

/** Kanonik tablo tipleri. İki lehçe aynı tariften üretildiği için yapıları eşittir. */
export type Tables = typeof sqliteTables;
/** Kanonik veritabanı tipi. PG bu tipe daraltılır (aşağıdaki gerekçeye bakın). */
export type Db = BetterSQLite3Database<Record<string, never>>;

export interface DbHandle {
  dialect: SqlDialect;
  db: Db;
  tables: Tables;
  /** Parametresiz ham SQL (yalnız DDL). `run`/`execute` farkını burada yutar. */
  execRaw(statement: string): Promise<void>;
  close(): Promise<void>;
}

export interface DbConfig {
  /** Boş/`undefined` → gömülü SQLite. `postgres://…` → dış PG. */
  url?: string | undefined;
  /** SQLite dosya yolu (url verilmediğinde). `:memory:` testler için. */
  sqlitePath: string;
  /** Şema parmak izi uyuşmazlığında veriyi silip yeniden kur. */
  autoReset: boolean;
}

export function isPostgresUrl(url: string | undefined): boolean {
  return !!url && /^postgres(ql)?:\/\//i.test(url);
}

export async function openDatabase(config: DbConfig): Promise<DbHandle> {
  const handle = isPostgresUrl(config.url)
    ? openPostgres(config.url as string)
    : openSqlite(config.url && config.url !== '' ? config.url : config.sqlitePath);
  await applySchema(handle, config.autoReset);
  return handle;
}

function openSqlite(path: string): DbHandle {
  const file = path.startsWith('file:') ? path.slice('file:'.length) : path;
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const connection = new BetterSqlite3(file);
  connection.pragma('journal_mode = WAL');
  connection.pragma('foreign_keys = ON');
  const db = drizzleSqlite(connection);
  return {
    dialect: 'sqlite',
    db,
    tables: sqliteTables,
    async execRaw(statement) {
      connection.exec(statement);
    },
    async close() {
      connection.close();
    },
  };
}

function openPostgres(url: string): DbHandle {
  const pool = new pg.Pool({ connectionString: url });
  const pgDb = drizzlePg(pool);
  return {
    dialect: 'pg',
    // Daraltma #1: iki sürücünün sorgu yüzeyi (select/insert/update/delete) aynı
    // şekli taşır; tek tip göstermek sorgu kodunun kopyalanmasını önler.
    db: pgDb as unknown as Db,
    // Daraltma #2: pg tabloları aynı spec'ten üretildiği için kolon adları/tipleri
    // sqlite tablolarıyla birebir aynıdır (`schema-parity` testi bunu doğrular).
    tables: pgTables as unknown as Tables,
    async execRaw(statement) {
      await pool.query(statement);
    },
    async close() {
      await pool.end();
    },
  };
}

/** Şemayı kurar; parmak izi uyuşmazlığında sessizce devam ETMEZ. */
async function applySchema(handle: DbHandle, autoReset: boolean): Promise<void> {
  const expected = schemaFingerprint();

  const readStored = async (): Promise<string | null> => {
    try {
      // Parametresiz: anahtar sabittir, enjeksiyon yüzeyi yok.
      const rows = await handle.db.all<{ value: string }>(
        sql.raw(`SELECT value FROM ${SCHEMA_META_TABLE} WHERE key = 'schema_fingerprint'`),
      );
      return rows[0]?.value ?? null;
    } catch {
      return null; // tablo henüz yok
    }
  };

  const stored = await readStored();
  if (stored !== null && stored !== expected) {
    if (!autoReset) {
      throw new Error(
        `Veritabanı şeması eski: kayıtlı parmak izi ${stored}, beklenen ${expected}. ` +
          `Mock'ta migration yoktur (plan K3: veri atılabilir). ` +
          `MIMMOCK_DB_AUTO_RESET=1 ile sıfırlayın ya da veri dosyasını silin.`,
      );
    }
    for (const statement of dropSchemaStatements(handle.dialect)) await handle.execRaw(statement);
  }

  for (const statement of createSchemaStatements(handle.dialect)) await handle.execRaw(statement);
  await handle.execRaw(
    `INSERT INTO ${SCHEMA_META_TABLE} (key, value) VALUES ('schema_fingerprint', '${expected}') ` +
      `ON CONFLICT (key) DO UPDATE SET value = '${expected}'`,
  );
}

export { dropSchemaStatements };
