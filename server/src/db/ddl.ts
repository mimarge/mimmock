/**
 * spec.ts → `CREATE TABLE` (iki lehçe).
 *
 * Mock'ta şema evrimi yoktur: veri atılabilir (plan K3) ve `_sandbox/reset`
 * vardır. Bu yüzden migration zinciri yerine açılışta kurulum yapılır. Mevcut
 * verinin şeması eskiyse SESSİZCE devam edilmez — `schema_meta` parmak izi
 * tutulur ve uyuşmazlıkta açık hata verilir (K4'ün "sessiz düşük-sadakat kipi
 * YOK" ilkesinin şema karşılığı).
 */
import { schemaSpec, toSnakeCase, type ColumnKind, type ColumnSpec, type TableSpec } from './spec.js';

export type SqlDialect = 'sqlite' | 'pg';

/** Lehçe farkının yaşadığı TEK yer. */
const SQL_TYPES: Record<SqlDialect, Record<ColumnKind, string>> = {
  sqlite: { text: 'TEXT', int: 'INTEGER', bool: 'INTEGER', ts: 'INTEGER', json: 'TEXT' },
  pg: { text: 'text', int: 'integer', bool: 'boolean', ts: 'timestamptz', json: 'jsonb' },
};

export const SCHEMA_META_TABLE = 'schema_meta';

function tableOrder(): string[] {
  const names = Object.keys(schemaSpec);
  const emitted: string[] = [];
  const pending = new Set(names);
  while (pending.size > 0) {
    let progressed = false;
    for (const name of names) {
      if (!pending.has(name)) continue;
      const spec = schemaSpec[name as keyof typeof schemaSpec] as TableSpec;
      const deps = Object.values(spec.columns)
        .map((c) => (c as ColumnSpec).references?.table)
        .filter((t): t is string => !!t && t !== name);
      if (deps.every((d) => !pending.has(d))) {
        emitted.push(name);
        pending.delete(name);
        progressed = true;
      }
    }
    if (!progressed) throw new Error(`Tablo referanslarında döngü var: ${[...pending].join(', ')}`);
  }
  return emitted;
}

/** Şemayı kuran ifadeler; sırayla çalıştırılır. */
export function createSchemaStatements(dialect: SqlDialect): string[] {
  const types = SQL_TYPES[dialect];
  const statements: string[] = [];

  statements.push(
    `CREATE TABLE IF NOT EXISTS ${SCHEMA_META_TABLE} (` +
      `key ${types.text} PRIMARY KEY, value ${types.text} NOT NULL)`,
  );

  for (const tableName of tableOrder()) {
    const spec = schemaSpec[tableName as keyof typeof schemaSpec] as TableSpec;
    const parts: string[] = [];
    for (const [colName, raw] of Object.entries(spec.columns)) {
      const col = raw as ColumnSpec;
      let part = `${toSnakeCase(colName)} ${types[col.kind]}`;
      if (col.primaryKey) part += ' PRIMARY KEY';
      if (col.notNull && !col.primaryKey) part += ' NOT NULL';
      if (col.unique) part += ' UNIQUE';
      if (col.references) {
        part +=
          ` REFERENCES ${toSnakeCase(col.references.table)}(${toSnakeCase(col.references.column)})` +
          (col.references.onDelete === 'cascade' ? ' ON DELETE CASCADE' : '');
      }
      parts.push(part);
    }
    statements.push(
      `CREATE TABLE IF NOT EXISTS ${toSnakeCase(tableName)} (\n  ${parts.join(',\n  ')}\n)`,
    );

    for (const cols of spec.uniques ?? []) {
      const name = `${toSnakeCase(tableName)}_${cols.map(toSnakeCase).join('_')}_uq`;
      statements.push(
        `CREATE UNIQUE INDEX IF NOT EXISTS ${name} ON ${toSnakeCase(tableName)} (${cols.map(toSnakeCase).join(', ')})`,
      );
    }
    for (const cols of spec.indexes ?? []) {
      const name = `${toSnakeCase(tableName)}_${cols.map(toSnakeCase).join('_')}_idx`;
      statements.push(
        `CREATE INDEX IF NOT EXISTS ${name} ON ${toSnakeCase(tableName)} (${cols.map(toSnakeCase).join(', ')})`,
      );
    }
  }
  return statements;
}

/** Veriyi silen ifadeler — `_sandbox/reset` ve testler kullanır. */
export function dropSchemaStatements(dialect: SqlDialect): string[] {
  const cascade = dialect === 'pg' ? ' CASCADE' : '';
  return [...tableOrder()].reverse()
    .map((t) => `DROP TABLE IF EXISTS ${toSnakeCase(t)}${cascade}`)
    .concat(`DROP TABLE IF EXISTS ${SCHEMA_META_TABLE}${cascade}`);
}
