/**
 * Şemanın tek kaynak olduğunu ÖLÇEN test.
 *
 * Mutasyonla sınanabilir: `spec.ts`'e bir kolon ekleyip `pnpm db:codegen`
 * koşmazsanız bu dosya kırmızıya döner. Kopya sayısını 0'da tutan bekçi budur.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { getTableColumns, type Column } from 'drizzle-orm';
import { generateAll } from './codegen.js';
import { schemaSpec, toSnakeCase, type ColumnSpec, type TableSpec } from './spec.js';
import { createSchemaStatements } from './ddl.js';
import * as sqliteTables from './dialects/sqlite.generated.js';
import * as pgTables from './dialects/pg.generated.js';

describe('lehçe dosyaları spec ile aynı hizada', () => {
  it('üretilmiş dosyalar güncel (codegen --check ile aynı denetim)', () => {
    const stale: string[] = [];
    for (const [path, expected] of generateAll()) {
      const actual = readFileSync(path, 'utf8');
      if (actual !== expected) stale.push(path);
    }
    expect(stale, '`pnpm db:codegen` koşulmamış').toEqual([]);
  });

  it('iki lehçe AYNI tablo ve kolon kümesini taşır', () => {
    const sqliteNames = Object.keys(sqliteTables).sort();
    const pgNames = Object.keys(pgTables).sort();
    expect(pgNames).toEqual(sqliteNames);

    for (const tableName of sqliteNames) {
      const s: Record<string, Column> = getTableColumns(
        sqliteTables[tableName as keyof typeof sqliteTables],
      );
      const p: Record<string, Column> = getTableColumns(
        pgTables[tableName as keyof typeof pgTables],
      );
      expect(Object.keys(p).sort(), `${tableName}: kolon adları`).toEqual(Object.keys(s).sort());

      for (const col of Object.keys(s)) {
        const sc = (s as Record<string, Column>)[col]!;
        const pc = (p as Record<string, Column>)[col]!;
        expect(pc.name, `${tableName}.${col}: DB kolon adı`).toBe(sc.name);
        expect(pc.notNull, `${tableName}.${col}: notNull`).toBe(sc.notNull);
        expect(pc.primary, `${tableName}.${col}: primaryKey`).toBe(sc.primary);
      }
    }
  });

  it('spec\'teki her kolon iki lehçede de var', () => {
    for (const [tableName, rawSpec] of Object.entries(schemaSpec)) {
      const spec = rawSpec as TableSpec;
      const sqliteCols: Record<string, Column> = getTableColumns(
        sqliteTables[tableName as keyof typeof sqliteTables],
      );
      for (const [colName, rawCol] of Object.entries(spec.columns)) {
        const col = rawCol as ColumnSpec;
        const generated = sqliteCols[colName];
        expect(generated, `${tableName}.${colName} üretilmemiş`).toBeDefined();
        expect(generated!.name).toBe(toSnakeCase(colName));
        expect(generated!.notNull).toBe(!!col.notNull || !!col.primaryKey);
      }
    }
  });

  it('DDL iki lehçede de her tabloyu kurar', () => {
    for (const dialect of ['sqlite', 'pg'] as const) {
      const sql = createSchemaStatements(dialect).join('\n');
      for (const tableName of Object.keys(schemaSpec)) {
        expect(sql, `${dialect}: ${tableName}`).toContain(
          `CREATE TABLE IF NOT EXISTS ${toSnakeCase(tableName)} (`,
        );
      }
    }
  });
});
