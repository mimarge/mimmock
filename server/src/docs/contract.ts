/**
 * Yanıt sözleşmesi denetçisi — TESTLER İÇİN.
 *
 * Gerçek bir yanıtı, OpenAPI belgesinin o uç + durum kodu için tarif ettiği
 * şemaya karşı doğrular. Şemalar `additionalProperties: false` ve bütün alanları
 * `required` olduğundan ölçüm İKİ YÖNLÜDÜR: sunucu belgede olmayan bir alan
 * dönerse de, belgedeki bir alanı dönmezse de kırmızı.
 *
 * 🔴 Hedefini bulamazsa FIRLATIR: belgede o uç/kod yoksa "doğrulanacak şema yok,
 * geçti" demek sahte yeşil olurdu.
 */
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { buildOpenApiDocument } from './openapi.js';

type Doc = { paths: Record<string, Record<string, { responses: Record<string, { content?: Record<string, { schema?: unknown }> }> }>> };

const doc = buildOpenApiDocument() as unknown as Doc & Record<string, unknown>;

// ESM/CJS birlikte çalışma: ajv paketleri `default` altında gelebilir.
const AjvCtor = ((Ajv2020 as unknown as { default?: unknown }).default ?? Ajv2020) as typeof Ajv2020;
const withFormats = ((addFormats as unknown as { default?: unknown }).default ?? addFormats) as typeof addFormats;

const ajv = new AjvCtor({ strict: false, allErrors: true });
withFormats(ajv);
ajv.addSchema({ ...doc, $id: 'openapi' });

const pointer = (segment: string) => segment.replace(/~/g, '~0').replace(/\//g, '~1');

/** `/v1/documents/doc_123` → `/v1/documents/{id}` eşlemesi için şablon listesi. */
export function specPathFor(concretePath: string): string {
  const path = concretePath.split('?')[0]!;
  for (const template of Object.keys(doc.paths)) {
    const re = new RegExp(`^${template.replace(/\{[^}]+\}/g, '[^/]+')}$`);
    if (re.test(path)) return template;
  }
  throw new Error(`Sözleşme: ${path} OpenAPI belgesinde yok`);
}

export function assertMatchesSpec(
  method: string,
  concretePath: string,
  status: number,
  body: unknown,
  contentType = 'application/json',
): void {
  const template = specPathFor(concretePath);
  const op = doc.paths[template]?.[method.toLowerCase()];
  if (!op) throw new Error(`Sözleşme: ${method} ${template} belgede yok`);
  const response = op.responses[String(status)] ?? op.responses[`${String(status)[0]}XX`];
  if (!response) {
    throw new Error(`Sözleşme: ${method} ${template} için ${status} yanıtı belgede tarif edilmemiş`);
  }
  if (!response.content?.[contentType]?.schema) {
    throw new Error(`Sözleşme: ${method} ${template} ${status} için ${contentType} şeması yok`);
  }
  const ref =
    `openapi#/paths/${pointer(template)}/${method.toLowerCase()}/responses/${status}` +
    `/content/${pointer(contentType)}/schema`;
  const validate = ajv.getSchema(ref) ?? ajv.compile({ $ref: ref });
  if (!validate(body)) {
    const detail = (validate.errors ?? [])
      .map((e) => `${e.instancePath || '(kök)'} ${e.message}${e.params ? ' ' + JSON.stringify(e.params) : ''}`)
      .join('\n  ');
    throw new Error(`Sözleşme ihlali: ${method} ${concretePath} → ${status}\n  ${detail}`);
  }
}
