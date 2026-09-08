FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm install
COPY src ./src
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm install --omit=dev \
  && npm cache clean --force
COPY --from=builder /app/dist ./dist
COPY public ./public
COPY scripts/production-check.mjs ./scripts/production-check.mjs
RUN mkdir -p /app/data /app/output \
  && chown -R node:node /app
USER node
ENV NODE_ENV=production
ENV PORT=8787
ENV DB_PATH=/app/data/auto-media.sqlite
ENV RENDER_OUTPUT_DIR=/app/output
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:8787/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
