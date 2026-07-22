# syntax=docker/dockerfile:1
# Build from the REPO ROOT (the server consumes @gaming-platform/core via the
# npm workspace):  docker build -f apps/server/Dockerfile .

FROM node:22-alpine AS manifests
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/

# Production node_modules straight from the lockfile - kept as its own stage
# (npm prune over a partial workspace install drops real dependencies).
FROM manifests AS deps-prod
RUN npm ci -w @gaming-platform/core -w @gaming-platform/server \
  --include-workspace-root --omit=dev

FROM manifests AS builder
RUN npm ci -w @gaming-platform/core -w @gaming-platform/server \
  --include-workspace-root
COPY packages/core packages/core
COPY apps/server apps/server
RUN npm run build -w @gaming-platform/core \
  && npm run build -w @gaming-platform/server

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

# The whole deps-prod tree: root node_modules PLUS workspace-nested ones
# (npm nests conflicting versions under e.g. apps/server/node_modules).
COPY --from=deps-prod /app /app
COPY --from=builder /app/packages/core/dist packages/core/dist
COPY --from=builder /app/apps/server/dist apps/server/dist

# Config comes from environment variables (no .env is baked into the image);
# migrations run automatically at boot (MigrationService).
WORKDIR /app/apps/server
EXPOSE 3000

# Container liveness only - orchestrator readiness should gate on
# /healthcheck, which round-trips Postgres/Redis.
HEALTHCHECK --interval=30s --timeout=4s --start-period=20s \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/health" || exit 1

CMD ["node", "dist/main.js"]
