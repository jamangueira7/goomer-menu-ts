# syntax=docker/dockerfile:1
# Alvos: build (dependências de desenvolvimento, compilação e testes; usado pelo serviço `test`)
#        e prod (imagem final enxuta, só dependências de produção, usuário não-root).
# Debian slim, e não Alpine, porque o argon2 traz binário pronto para glibc e o Prisma precisa do OpenSSL.

FROM node:22-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV CHECKPOINT_DISABLE=1 PRISMA_HIDE_UPDATE_MESSAGE=1 npm_config_update_notifier=false
WORKDIR /app
RUN chown node:node /app

FROM base AS build
USER node
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY --chown=node:node . .
RUN npm run build

FROM base AS prod-deps
USER node
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM base AS prod
ENV NODE_ENV=production
USER node
COPY --chown=node:node package.json ./
COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node --from=build /app/dist ./dist
EXPOSE 8080
CMD ["node", "dist/src/server.js"]
