/**
 * Görüntü uçları — plan §4 (`/pdf`) ve M7.
 *
 * Ölçü: *"gerçekten çizilmiş çıktı, şablon kaynağının okunuşu değil."*
 * Bu yüzden mock şablon dönüşümünü kendisi uygulamaz; CANLI mimkit'e çizdirir (plan K4).
 * Sahte bir PDF üreten sandbox, geliştiriciye şablonun gerçekte nasıl göründüğünü
 * hiç göstermez — ve görüntü, geliştiricinin müşterisine gösterdiği tek şeydir.
 */
import type { FastifyInstance } from 'fastify';
import { MimMockError } from '../errors.js';
import { RenderRejectedError, RenderUnavailableError } from '../kittest/render.js';
import type { CompanyRow, DocumentRow } from '../db/repo.js';
import type { AppDeps } from '../deps.js';

export function registerRenderRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { repo, kittest } = deps;

  function requireRenderer() {
    if (!kittest.renderer) {
      throw new MimMockError('TEMPLATE_UNAVAILABLE', {
        reason:
          'Görüntü servisi yapılandırılmamış (MIMMOCK_MIMKIT_URL). ' +
          'Mock şablonu KENDİSİ çizmez — görüntü canlı gelir (plan K4/§1).',
      });
    }
    return kittest.renderer;
  }

  /** Belgeyi ve sahibini birlikte çözer; şablon seçimi şirkette durur. */
  async function load(
    tenantId: string,
    id: string,
  ): Promise<{ document: DocumentRow; company: CompanyRow }> {
    const document = await repo.findDocumentById(tenantId, id);
    if (!document) throw new MimMockError('DOCUMENT_NOT_FOUND');
    const company = await repo.findCompanyById(tenantId, document.companyId);
    if (!company) throw new MimMockError('CONTEXT');
    return { document, company };
  }

  /**
   * Şirketin şablon seçimi `templateId@version` biçiminde saklanır.
   * Sürüm verilmezse 1 — `template` yolu sürüm SABİTLİ ister (ölçüldü).
   */
  function templateOf(company: CompanyRow) {
    if (!company.templateId) return undefined;
    const [id, rawVersion] = company.templateId.split('@');
    if (!id) return undefined;
    const version = Number(rawVersion ?? 1);
    return { id, version: Number.isFinite(version) ? version : 1 };
  }

  function toMimMockError(error: unknown): never {
    if (error instanceof RenderUnavailableError) {
      throw new MimMockError('TEMPLATE_UNAVAILABLE', { reason: error.message });
    }
    if (error instanceof RenderRejectedError) {
      // 404 = şablon yok/bu mükellefe ait değil ("var ama senin değil" sızmaz).
      if (error.status === 404) {
        throw new MimMockError('TEMPLATE_NOT_FOUND', {
          reason: `${error.code ?? 'NOT_FOUND'}: ${error.message}`,
        });
      }
      throw new MimMockError('TEMPLATE_REJECTED', {
        reason: `${error.code ?? 'RED'}: ${error.message}`,
      });
    }
    throw error;
  }

  app.get<{ Params: { id: string } }>('/v1/documents/:id/html', async (request, reply) => {
    const auth = await request.authenticate();
    const renderer = requireRenderer();
    const { document, company } = await load(auth.tenant.id, request.params.id);

    try {
      const rendered = await renderer.html({
        xml: document.ublXml,
        docType: document.type,
        ownerTaxId: company.vkn,
        template: templateOf(company),
      });
      reply.header('content-type', 'text/html; charset=utf-8');
      // Hangi şablonun çizdiği görünür olsun — "neden böyle göründü" sorusu.
      if (rendered.templateUsed) {
        reply.header(
          'X-MimMock-Template',
          `${rendered.templateUsed.id}@${rendered.templateUsed.version}`,
        );
      } else {
        reply.header('X-MimMock-Template', 'system-default');
      }
      return rendered.html;
    } catch (error) {
      toMimMockError(error);
    }
  });

  app.get<{ Params: { id: string } }>('/v1/documents/:id/pdf', async (request, reply) => {
    const auth = await request.authenticate();
    const renderer = requireRenderer();
    const { document, company } = await load(auth.tenant.id, request.params.id);

    try {
      const rendered = await renderer.pdf({
        xml: document.ublXml,
        docType: document.type,
        ownerTaxId: company.vkn,
        template: templateOf(company),
      });
      reply.header('content-type', 'application/pdf');
      reply.header(
        'content-disposition',
        `inline; filename="${document.documentNumber ?? document.ettn}.pdf"`,
      );
      return reply.send(rendered.bytes);
    } catch (error) {
      toMimMockError(error);
    }
  });

  /** Şablon listesi — şirket tanımında hangi `templateId` seçilebileceği. */
  app.get('/v1/templates', async (request) => {
    const auth = await request.authenticate();
    const renderer = requireRenderer();
    const owner = auth.company?.vkn ?? (await repo.listCompanies(auth.tenant.id))[0]?.vkn;
    if (!owner) return { templates: [] };
    try {
      return { templates: await renderer.listTemplates(owner) };
    } catch (error) {
      toMimMockError(error);
    }
  });
}
