/**
 * Depodaki belge kopyalarını üretir: `llms.txt`, `llms-full.txt`, `docs/openapi.json`.
 *
 * Neden depoda da: GitHub'da depoyu okuyan bir ajan (ya da insan) container'ı
 * çalıştırmadan sözleşmeye ulaşabilsin. Neden ÜRETİLMİŞ: elle yazılmış ikinci bir
 * kopya ilk değişiklikte eskirdi.
 *
 *   pnpm --filter @mimmock/server docs:gen     → yazar
 *   pnpm --filter @mimmock/server docs:check   → farkı gösterir, varsa ÇIKIŞ 1 (CI)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildLlmsFull, buildLlmsIndex, DEFAULT_BASE_URL } from './llms.js';
import { buildOpenApiDocument } from './openapi.js';

const ROOT = resolve(import.meta.dirname, '../../..');

export const GENERATED_FILES: ReadonlyArray<{ path: string; build: () => string }> = [
  { path: 'llms.txt', build: () => buildLlmsIndex(DEFAULT_BASE_URL) },
  { path: 'llms-full.txt', build: () => buildLlmsFull(DEFAULT_BASE_URL) },
  { path: 'docs/openapi.json', build: () => `${JSON.stringify(buildOpenApiDocument(DEFAULT_BASE_URL), null, 2)}\n` },
];

function main(): void {
  const check = process.argv.includes('--check');
  const stale: string[] = [];
  for (const file of GENERATED_FILES) {
    const target = resolve(ROOT, file.path);
    const next = file.build();
    const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
    if (current === next) continue;
    if (check) stale.push(file.path);
    else {
      writeFileSync(target, next);
      console.log(`yazıldı: ${file.path} (${next.length} karakter)`);
    }
  }
  if (check) {
    if (stale.length > 0) {
      console.error(
        `🔴 Belge kopyaları ESKİ: ${stale.join(', ')}\n` +
          '   Kaynak değişti ama depodaki kopya üretilmedi. Çalıştırın:\n' +
          '   pnpm --filter @mimmock/server docs:gen',
      );
      process.exit(1);
    }
    console.log('belge kopyaları taze');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
