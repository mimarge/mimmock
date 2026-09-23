# MimMock — tek container, tek port, tek süreç (plan K19).
# Temel imaj plan §2c'de sabit: node:22-alpine, çok aşamalı derleme.

FROM node:22-alpine AS build
WORKDIR /app

# better-sqlite3 native derlemesi icin (musl'da hazir ikili olmayabilir)
RUN apk add --no-cache python3 make g++

RUN corepack enable && corepack prepare pnpm@10.30.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY server/package.json server/
COPY panel/package.json panel/
RUN pnpm install --frozen-lockfile

COPY server/ server/
COPY panel/ panel/

# Lehçe dosyaları spec ile uyumlu mu — imaja eski şema girmesin.
RUN pnpm --filter @mimmock/server db:codegen:check
RUN pnpm --filter @mimmock/panel build
RUN pnpm --filter @mimmock/server build

# Üretim bağımlılıkları (derleme araçları olmadan)
RUN pnpm --filter @mimmock/server --prod deploy --legacy /app/bundle


FROM node:22-alpine AS runtime
ARG VERSION=dev
# OCI etiketleri: imaj depoya bağlanır (GHCR sayfasında README görünür) ve sürümünü söyler.
LABEL org.opencontainers.image.title="MimMock" \
      org.opencontainers.image.description="MimForge e-Fatura altyapısının bugünkü davranışının yerel simülatörü. Tek bağımlılık: mimkit. Belgeler: /docs · /llms-full.txt" \
      org.opencontainers.image.source="https://github.com/mimarge/mimmock" \
      org.opencontainers.image.url="https://github.com/mimarge/mimmock" \
      org.opencontainers.image.documentation="https://github.com/mimarge/mimmock#kurulum" \
      org.opencontainers.image.vendor="Mimarge" \
      org.opencontainers.image.version="${VERSION}"
WORKDIR /app
ENV NODE_ENV=production \
    MIMMOCK_PORT=8088 \
    MIMMOCK_DATA_DIR=/data \
    MIMMOCK_PANEL_DIST=/app/panel/dist

COPY --from=build /app/bundle/node_modules ./node_modules
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/panel/dist ./panel/dist

# Kalıcı veri birimi (plan §2c)
RUN mkdir -p /data && chown -R node:node /data
VOLUME ["/data"]
USER node

EXPOSE 8088
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.MIMMOCK_PORT||8088)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
