/**
 * Belge yüzeyi — `/docs` (Scalar), `/openapi.json`, `/llms.txt`, `/llms-full.txt`, `/v1`.
 *
 * Hepsi kimlik İSTEMEZ: belgeler herkese açıktır, sandbox yereldir.
 *
 * 🔴 Scalar DIŞARI KONUŞMAZ: JS paketin içinden sunulur, varsayılan font sunucusu
 * (fonts.scalar.com), telemetri ve MCP kapalıdır. Yazı yüzleri panelin kendi
 * self-host kopyalarıdır. Sandbox internetsiz bir makinede de belgesini açabilmeli.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import scalar from '@scalar/fastify-api-reference';
import { buildOpenApiDocument } from './openapi.js';
import { buildLlmsFull, buildLlmsIndex } from './llms.js';
import { SEED_TENANT_API_KEY } from '../seed.js';

/** İsteğin geldiği adres — container başka porttan yayınlanıyorsa belge doğru adresi söylesin. */
function baseUrlOf(request: FastifyRequest): string {
  const proto = (request.headers['x-forwarded-proto'] as string | undefined) ?? request.protocol;
  const host = (request.headers['x-forwarded-host'] as string | undefined) ?? request.headers.host ?? 'localhost:8088';
  return `${proto}://${host}`;
}

/**
 * Panelle aynı dünya: tahta sarısı, mürekkep zemin, kendi yüzlerimiz.
 * Scalar'ın tema değişkenleri üzerine yazılır; yapısına dokunulmaz.
 */
const THEME_CSS = `
@font-face { font-family: 'Note'; font-weight: 400; font-display: swap; src: url('/fonts/barlow-400-latin.woff2') format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+2000-206F; }
@font-face { font-family: 'Note'; font-weight: 400; font-display: swap; src: url('/fonts/barlow-400-latin-ext.woff2') format('woff2'); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1E9F; }
@font-face { font-family: 'Note'; font-weight: 600; font-display: swap; src: url('/fonts/barlow-600-latin.woff2') format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+2000-206F; }
@font-face { font-family: 'Note'; font-weight: 600; font-display: swap; src: url('/fonts/barlow-600-latin-ext.woff2') format('woff2'); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1E9F; }
@font-face { font-family: 'Data'; font-weight: 400; font-display: swap; src: url('/fonts/plex-mono-400-latin.woff2') format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+2000-206F; }
@font-face { font-family: 'Data'; font-weight: 400; font-display: swap; src: url('/fonts/plex-mono-400-latin-ext.woff2') format('woff2'); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1E9F; }
.dark-mode, .light-mode {
  --scalar-font: 'Note', system-ui, sans-serif;
  --scalar-font-code: 'Data', ui-monospace, monospace;
  --scalar-radius: 0; --scalar-radius-lg: 0; --scalar-radius-xl: 0;
}
.dark-mode {
  --scalar-background-1: #0d0f12;
  --scalar-background-2: #15181d;
  --scalar-background-3: #20242b;
  --scalar-background-accent: rgba(245, 184, 32, .12);
  --scalar-color-1: #ece9e2;
  --scalar-color-2: #9a9ca2;
  --scalar-color-3: #7b818b;
  --scalar-color-accent: #f5b820;
  --scalar-border-color: #2a2f37;
  --scalar-color-green: #3fc47f;
  --scalar-color-red: #f4676c;
  --scalar-color-yellow: #f5b820;
  --scalar-color-orange: #f0a02c;
  --scalar-color-blue: #9aa6c2;
}
.dark-mode .t-doc__sidebar, .dark-mode .sidebar { --scalar-sidebar-background-1: #08090b; --scalar-sidebar-color-active: #f5b820; }
`;

/**
 * Senkron çağrılır: Fastify eklentiyi kuyruğa alır ve `ready()`/`listen()` sırasında
 * yükler. `buildServerParts` senkron kalır.
 */
export function registerDocsRoutes(app: FastifyInstance): void {
  app.get('/openapi.json', async (request) => buildOpenApiDocument(baseUrlOf(request)));

  app.get('/llms.txt', async (request, reply) => {
    reply.header('content-type', 'text/markdown; charset=utf-8');
    return buildLlmsIndex(baseUrlOf(request));
  });

  app.get('/llms-full.txt', async (request, reply) => {
    reply.header('content-type', 'text/markdown; charset=utf-8');
    return buildLlmsFull(baseUrlOf(request));
  });

  /**
   * `/v1` — API'nin kök dizini. Bir ajan ya da geliştirici yalnız taban adresi
   * bilirse, nereye bakacağını buradan öğrenir.
   */
  app.get('/v1', async (request) => {
    const base = baseUrlOf(request);
    return {
      api: 'mimmock v1',
      note: 'MimForge üretim API\'si DEĞİLDİR; yerel simülatördür ve yüzey geçicidir.',
      docs: {
        llms: `${base}/llms.txt`,
        llmsFull: `${base}/llms-full.txt`,
        openapi: `${base}/openapi.json`,
        reference: `${base}/docs`,
        panel: `${base}/`,
        health: `${base}/healthz`,
      },
      auth: 'Authorization: Bearer <kiracı anahtarı> + X-Company: <VKN>',
    };
  });

  void app.register(scalar, {
    routePrefix: '/docs',
    logLevel: 'silent',
    configuration: {
      // Belge sunucudan canlı gelir — kopyası yok.
      url: '/openapi.json',
      pageTitle: 'MimMock API',
      theme: 'none',
      customCss: THEME_CSS,
      forceDarkModeState: 'dark',
      hideDarkModeToggle: true,
      withDefaultFonts: false,
      telemetry: false,
      mcp: { disabled: true },
      showDeveloperTools: 'never',
      defaultOpenFirstTag: false,
      persistAuth: true,
      authentication: {
        preferredSecurityScheme: 'bearerAuth',
        securitySchemes: { bearerAuth: { token: SEED_TENANT_API_KEY } },
      },
      metaData: {
        title: 'MimMock API',
        description: 'MimMock sandbox API referansı. LLM/ajanlar için: /llms-full.txt',
      },
    },
  });
}
