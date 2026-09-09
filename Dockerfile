FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --no-audit --no-fund
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN chown node:node /app
USER node
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
  && npm cache clean --force
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node public ./public
COPY --chown=node:node scripts/production-check.mjs ./scripts/production-check.mjs
COPY --chown=node:node scripts/sqlite-backup.mjs ./scripts/sqlite-backup.mjs
COPY --chown=node:node scripts/cutover-client.mjs ./scripts/cutover-client.mjs
COPY --chown=node:node scripts/public-rollout-client.mjs ./scripts/public-rollout-client.mjs
RUN mkdir -p /app/data /app/output
ARG APP_REVISION=unknown
LABEL org.opencontainers.image.title="bien-noi-nho-auto-media" \
      org.opencontainers.image.revision="$APP_REVISION"
ENV NODE_ENV=production
ENV PORT=8787
ENV DB_PATH=/app/data/auto-media.sqlite
ENV RENDER_OUTPUT_DIR=/app/output
ENV APP_REVISION=$APP_REVISION
ENV RELEASE_CHANNEL=stable
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:8787/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
