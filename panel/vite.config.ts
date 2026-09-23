import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Panel aynı Fastify sürecinden sunulur (plan K19) — derleme çıktısı `dist/`.
// Geliştirme kipinde API'ye vekil: tek port hissi korunur.
export default defineConfig({
  plugins: [react()],
  // Sunucuyla ortak sabitler (ProfileID gibi) tek kaynaktan okunur — kopya yok.
  resolve: { alias: { '@shared': resolve(import.meta.dirname, '../server/src') } },
  server: {
    port: 5188,
    proxy: {
      '/v1': 'http://127.0.0.1:8088',
      '/healthz': 'http://127.0.0.1:8088',
      '/docs': 'http://127.0.0.1:8088',
      '/openapi.json': 'http://127.0.0.1:8088',
      '/llms.txt': 'http://127.0.0.1:8088',
      '/llms-full.txt': 'http://127.0.0.1:8088',
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
