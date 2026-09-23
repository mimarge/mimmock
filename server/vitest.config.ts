import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Testler aynı SQLite dosyasını paylaşmasın diye her dosya kendi bellek DB'sini açar.
    pool: 'forks',
  },
});
