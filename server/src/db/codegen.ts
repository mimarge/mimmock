/**
 * spec.ts → iki lehçenin Drizzle tablo dosyası.
 *
 * Neden üretim: Drizzle'da `sqliteTable`/`pgTable` ayrı API'lerdir. Elle yazmak
 * tablo başına kopya demektir. Üretim, tarifi tek yerde tutar ve Drizzle'ın tip
 * çıkarımını korur. CI "üretim güncel mi" diye denetler (`db:codegen --check`).
 *
 * Lehçe farkı YALNIZ aşağıdaki eşleme tablosunda yaşar; gövdede `if` yoktur.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { schemaSpec, toSnakeCase, type ColumnSpec, type TableSpec } from './spec.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, 'dialects');

interface Dialect {
  /** Üretilen dosyanın adı. */
  file: string;
  /** Drizzle alt modülü. */
  module: string;
  /** Tablo kurucusu. */
  table: string;
  /** Mantıksal cins → Drizzle kolon ifadesi. `%c` sütunun DB adıdır. */
  column: Record<ColumnSpec['kind'], string>;
  /** Kullanılacak Drizzle sembolleri (import satırı buradan kurulur). */
  imports: string[];
}

const DIALECTS: Dialect[] = [
  {
    file: 'sqlite.generated.ts',
    module: 'drizzle-orm/sqlite-core',
    table: 'sqliteTable',
    column: {
      text: "text('%c')",
      int: "integer('%c')",
      bool: "integer('%c', { mode: 'boolean' })",
      ts: "integer('%c', { mode: 'timestamp_ms' })",
      json: "text('%c', { mode: 'json' })",
    },
    imports: ['sqliteTable', 'text', 'integer', 'uniqueIndex', 'index'],
  },
  {
    file: 'pg.generated.ts',
    module: 'drizzle-orm/pg-core',
    table: 'pgTable',
    column: {
      text: "text('%c')",
      int: "integer('%c')",
      bool: "boolean('%c')",
      ts: "timestamp('%c', { withTimezone: true, mode: 'date' })",
      json: "jsonb('%c')",
    },
    imports: ['pgTable', 'text', 'integer', 'boolean', 'timestamp', 'jsonb', 'uniqueIndex', 'index'],
  },
];

/** Referans zinciri: bir tablo, referans verdiği tablodan SONRA yazılamaz. */
function orderTables(): string[] {
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
    if (!progressed) {
      throw new Error(`Tablo referanslarında döngü var: ${[...pending].join(', ')}`);
    }
  }
  return emitted;
}

function columnExpression(dialect: Dialect, name: string, spec: ColumnSpec): string {
  let expr = dialect.column[spec.kind].replace('%c', toSnakeCase(name));
  if (spec.kind === 'json') expr += `.$type<${spec.jsonType ?? 'unknown'}>()`;
  if (spec.primaryKey) expr += '.primaryKey()';
  if (spec.notNull) expr += '.notNull()';
  if (spec.unique) expr += '.unique()';
  if (spec.references) {
    const onDelete = spec.references.onDelete ? `, { onDelete: '${spec.references.onDelete}' }` : '';
    expr += `.references(() => ${spec.references.table}.${spec.references.column}${onDelete})`;
  }
  // `now`: iki lehçede de uygulama damgası — DB default'u yok, ayrışma yok.
  if (spec.default === 'now') expr += '.$defaultFn(() => new Date())';
  return expr;
}

function renderDialect(dialect: Dialect): string {
  const lines: string[] = [];
  lines.push('// ÜRETİLMİŞ DOSYA — elle düzenlemeyin.');
  lines.push('// Kaynak: src/db/spec.ts · Üretici: src/db/codegen.ts');
  lines.push('// Güncellemek için: pnpm db:codegen');
  lines.push('');
  lines.push(`import { ${dialect.imports.join(', ')} } from '${dialect.module}';`);
  lines.push('');

  for (const tableName of orderTables()) {
    const spec = schemaSpec[tableName as keyof typeof schemaSpec] as TableSpec;
    lines.push(`export const ${tableName} = ${dialect.table}('${toSnakeCase(tableName)}', {`);
    for (const [colName, colSpec] of Object.entries(spec.columns)) {
      lines.push(`  ${colName}: ${columnExpression(dialect, colName, colSpec as ColumnSpec)},`);
    }
    const constraints: string[] = [];
    for (const cols of spec.uniques ?? []) {
      const idxName = `${toSnakeCase(tableName)}_${cols.map(toSnakeCase).join('_')}_uq`;
      constraints.push(`uniqueIndex('${idxName}').on(${cols.map((c) => `t.${c}`).join(', ')})`);
    }
    for (const cols of spec.indexes ?? []) {
      const idxName = `${toSnakeCase(tableName)}_${cols.map(toSnakeCase).join('_')}_idx`;
      constraints.push(`index('${idxName}').on(${cols.map((c) => `t.${c}`).join(', ')})`);
    }
    if (constraints.length > 0) {
      lines.push(`}, (t) => [`);
      for (const c of constraints) lines.push(`  ${c},`);
      lines.push(`]);`);
    } else {
      lines.push(`});`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function generateAll(): Map<string, string> {
  const out = new Map<string, string>();
  for (const dialect of DIALECTS) out.set(join(OUT_DIR, dialect.file), renderDialect(dialect));
  return out;
}

function main(): void {
  const checkOnly = process.argv.includes('--check');
  let stale = false;
  for (const [path, content] of generateAll()) {
    const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
    if (current === content) continue;
    stale = true;
    if (checkOnly) {
      console.error(`GÜNCEL DEĞİL: ${path}`);
    } else {
      writeFileSync(path, content, 'utf8');
      console.log(`yazıldı: ${path}`);
    }
  }
  if (checkOnly && stale) {
    console.error('Üretilmiş lehçe dosyaları spec.ts ile uyumsuz. `pnpm db:codegen` koşun.');
    process.exit(1);
  }
  if (!stale) console.log('lehçe dosyaları güncel');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
