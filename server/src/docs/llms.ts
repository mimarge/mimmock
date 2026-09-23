/**
 * LLM belgeleri — `/llms.txt` (dizin, llmstxt.org biçimi) ve `/llms-full.txt`.
 *
 * Düzyazı `content/guide.md`'de durur; tablolar (durumlar, geçişler, senaryolar,
 * hata kataloğu, uç listesi) burada sunucunun KENDİ sabitlerinden üretilir. Bir
 * durum eklenirse, bir hata kodu değişirse belge kendiliğinden düzelir.
 *
 * Aynı metin üç yere gider: HTTP uçları, depodaki `llms.txt` / `llms-full.txt`
 * (üretilmiş kopya, tazeliği CI'da `docs:check` ile ölçülür) ve OpenAPI açıklaması.
 */
import { readFileSync } from 'node:fs';
import { ERROR_CATALOG } from '../errors.js';
import { DOC_STATUS_NOTES, REPLY_STATUS_NOTES, type StatusNote } from '../status.js';
import { TRANSITIONS } from '../engine/transitions.js';
import { REPLY_TRANSITIONS } from '../engine/inbound-transitions.js';
import { SCENARIOS, SELECTABLE_SCENARIOS } from '../engine/scenarios.js';
import { RESEND_CLASS_CODES } from '../engine/resend-class.js';
import { RETRY_DELAYS_MS, WEBHOOK_EVENTS } from '../webhooks/dispatcher.js';
import { SEED_TENANT_API_KEY } from '../seed.js';
import { buildOpenApiDocument, OPENAPI_TAGS } from './openapi.js';

export const DEFAULT_BASE_URL = 'http://localhost:8088';

/** Markdown tablosunda `|` hücreyi bölmesin. */
const cell = (value: unknown): string =>
  String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

function table(head: string[], rows: unknown[][]): string {
  return [
    `| ${head.join(' | ')} |`,
    `|${head.map(() => '---').join('|')}|`,
    ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`),
  ].join('\n');
}

function noteRows(notes: Readonly<Record<string, StatusNote>>): unknown[][] {
  return Object.entries(notes).map(([name, n]) => [
    `\`${name}\``,
    [n.short, n.long].filter(Boolean).join(' '),
    n.producedByMock ? 'evet' : '**hayır** — tanı ama sandbox\'ta göremezsin',
  ]);
}

function durationText(ms: number): string {
  if (ms >= 86_400_000) return `${Math.round(ms / 86_400_000)} gün`;
  if (ms >= 60_000) return `${Math.round(ms / 60_000)} dk`;
  return `${Math.round(ms / 1000)} sn`;
}

function codeOf(rule: { rawGibCode?: unknown; codeLabel?: string }): string {
  if (typeof rule.rawGibCode === 'number') return String(rule.rawGibCode);
  if (rule.codeLabel) return rule.codeLabel;
  return '—';
}

function transitionsTable(): string {
  const outbound = table(
    ['Kural', 'Nereden', 'Olay', 'Ham GİB kodu', 'Nereye', 'Etki', 'Not', 'MimForge kaynağı'],
    TRANSITIONS.map((t) => [
      `\`${t.id}\``,
      t.from.length > 0 ? t.from.join(', ') : '(giriş)',
      t.event,
      codeOf(t),
      t.to,
      [t.deliveredAt === 'set' ? 'deliveredAt yazılır' : t.deliveredAt === 'clear' ? 'deliveredAt TEMİZLENİR' : '',
       t.alarm ? `alarm: ${t.alarm}` : ''].filter(Boolean).join(' · ') || '—',
      t.note ?? '',
      `\`${t.source}\``,
    ]),
  );
  const reply = table(
    ['Kural', 'Nereden (replyStatus)', 'Olay', 'Ham GİB kodu', 'Nereye', 'Not'],
    REPLY_TRANSITIONS.map((t) => [
      `\`${t.id}\``,
      t.from.join(', '),
      t.event,
      t.rawGibCode ?? '—',
      t.to ?? 'ACCEPTED / REJECTED (karar yanıt açılırken saklanır)',
      t.note ?? '',
    ]),
  );
  return (
    '**Kurallar sırayla denenir** — sıra anlamlıdır (ör. `G12` `G11`\'den önce: ' +
    '`1230` `DELIVERED`\'dan gelirse teslimi geri alır).\n\n' +
    outbound +
    '\n\n**Yanıt ekseni** (`replyStatus`; belge `status`\'u değişmez):\n\n' +
    reply
  );
}

function scenariosTable(): string {
  return table(
    ['Senaryo', 'X-Scenario ile seçilir', 'Ne öğretir', 'Adımlar (sanal saat, birikimli)', 'Sonu'],
    Object.values(SCENARIOS).map((s) => [
      `\`${s.name}\``,
      (SELECTABLE_SCENARIOS as readonly string[]).includes(s.name) ? 'evet' : 'hayır (otomatik)',
      s.description,
      s.steps
        .map((step) =>
          `+${durationText(step.delayMs)} ${step.event}${step.rawGibCode ? ` ${step.rawGibCode}` : ''}` +
          (step.alarm ? ` ⚠ ${step.alarm}` : ''),
        )
        .join(' → '),
      s.endsOpen ? '**AÇIK** kalır (hata değil)' : 'kapanır',
    ]),
  );
}

function errorsTable(): string {
  return table(
    ['errorCode', 'HTTP', 'Anlam', 'Kaynak'],
    Object.entries(ERROR_CATALOG).map(([code, def]) => [`\`${code}\``, def.status, def.reason, `\`${def.source}\``]),
  );
}

function endpointsList(): string {
  const doc = buildOpenApiDocument() as { paths: Record<string, Record<string, { tags?: string[]; summary?: string }>> };
  const byTag = new Map<string, string[]>();
  for (const [path, ops] of Object.entries(doc.paths)) {
    for (const [method, op] of Object.entries(ops)) {
      const tag = op.tags?.[0] ?? 'Diğer';
      const list = byTag.get(tag) ?? [];
      list.push(`- \`${method.toUpperCase()} ${path}\` — ${op.summary ?? ''}`);
      byTag.set(tag, list);
    }
  }
  return OPENAPI_TAGS.filter((t) => byTag.has(t.name))
    .map((t) => `### ${t.name}\n\n${t.description}\n\n${byTag.get(t.name)!.join('\n')}`)
    .join('\n\n');
}

function guideTemplate(): string {
  return readFileSync(new URL('./content/guide.md', import.meta.url), 'utf8');
}

/** `/llms-full.txt` — tam kılavuz. */
export function buildLlmsFull(baseUrl = DEFAULT_BASE_URL): string {
  const values: Record<string, string> = {
    BASE: baseUrl,
    API_KEY: SEED_TENANT_API_KEY,
    STATUSES: table(['Durum', 'Anlam', 'Mock üretiyor mu'], noteRows(DOC_STATUS_NOTES)),
    REPLY_STATUSES: table(['Durum', 'Anlam', 'Mock üretiyor mu'], noteRows(REPLY_STATUS_NOTES)),
    TRANSITIONS: transitionsTable(),
    SCENARIOS: scenariosTable(),
    ERRORS: errorsTable(),
    RESEND: table(
      ['Sınıf', 'Ne yapılır', 'Ham GİB kodları'],
      [
        ['**A**', 'Yeniden gönderilir → `PROCESSING`', RESEND_CLASS_CODES.A.join(', ')],
        ['**B**', '`409 NEEDS_RESIGN` — belgeyi düzelt, aynı ETTN ile yeniden POST et', RESEND_CLASS_CODES.B.join(', ')],
        ['**C**', '`409 NOT_RESENDABLE_GIB` — asla / bekle', RESEND_CLASS_CODES.C.join(', ')],
      ],
    ),
    WEBHOOK_EVENTS: WEBHOOK_EVENTS.map((e) => `\`${e}\``).join(', '),
    RETRY: RETRY_DELAYS_MS.map((d) => durationText(d)).join(' → '),
    ENDPOINTS: endpointsList(),
  };
  const rendered = guideTemplate().replace(/\{\{([A-Z_]+)\}\}/g, (match, key: string) => {
    const value = values[key];
    // 🔴 Tanımsız yer tutucu SESSİZ geçmez: belgeye `{{…}}` sızarsa fırlat.
    if (value === undefined) throw new Error(`llms-full: tanımsız yer tutucu ${match}`);
    return value;
  });
  return rendered.endsWith('\n') ? rendered : `${rendered}\n`;
}

/** `/llms.txt` — llmstxt.org biçiminde kısa dizin. */
export function buildLlmsIndex(baseUrl = DEFAULT_BASE_URL): string {
  return `# MimMock

> MimForge e-Fatura altyapısının bugünkü davranışının yerel simülatörü (sandbox). Gerçek UBL-TR üretir, canlı XSD + şematrondan geçirir, test sertifikasıyla imzalar, belgeyi MimForge'dan ölçülmüş durum makinesinde yürütür ve webhook atar. Gerçek GİB'e hiçbir şey gitmez. Yüzey GEÇİCİDİR — entegrasyonu ince bir adaptör katmanının arkasına yazın.

Bir kodlama ajanıysanız: önce **llms-full.txt**'yi baştan sona okuyun. En sık yapılan beş hata (teslim anı 1220'dir, 1300 değil; teslim 1230 ile geri alınabilir; belge düzleminde FAILED yoktur; gelen belge iki adımlıdır; SEND_FAILED terminal değildir) orada §1'de.

Tek dış bağımlılık: mimkit (doğrulama + numaralama + görüntü). Adres ve anahtar için bilgi@mimsoft.com.tr adresine e-posta gönderin. İmaj: \`ghcr.io/mimarge/mimmock:latest\`.

Kimlik: \`Authorization: Bearer ${SEED_TENANT_API_KEY}\` + \`X-Company: 1111111111\` (tohum kiracı ve gönderici şirket; alıcı \`2222222222\`).

## Belgeler

- [Tam kılavuz](${baseUrl}/llms-full.txt): durum makinesi, geçiş tablosu, senaryolar, webhook sözleşmesi ve doğrulama kodu, hata kataloğu, entegrasyon tarifi, test tarifleri, uç listesi
- [OpenAPI 3.1](${baseUrl}/openapi.json): makinece okunan sözleşme — istemci/tip üretimi için
- [Etkileşimli API referansı](${baseUrl}/docs): insan için, "Try it" istemcisiyle

## Çalıştırma

- [Sağlık](${baseUrl}/healthz): mimkit hazır değilse 503 \`degraded\`
- [Panel](${baseUrl}/): durum tahtası — belgeler, olay ekseni, webhook teslimleri, ham istek günlüğü

## Optional

- [Webhook imza doğrulayıcı betik](https://github.com/mimarge/mimmock/blob/main/scripts/verify-webhook-signature.mjs): bağımsız referans uygulama
- [Kurulum ve işletim](https://github.com/mimarge/mimmock#kurulum): container, ortam değişkenleri, sıfırlama, yedek
`;
}
