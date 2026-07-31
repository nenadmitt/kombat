# syntax=docker/dockerfile:1
# Build from the REPO ROOT (the lockfile lives there - npm workspaces):
#   docker build -f apps/web/Dockerfile .

FROM node:22-alpine AS manifests
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/

# Production node_modules straight from the lockfile - kept as its own stage
# (npm prune over a partial workspace install drops real dependencies).
FROM manifests AS deps-prod
RUN npm ci -w @gaming-platform/web --include-workspace-root --omit=dev

FROM manifests AS builder
RUN npm ci -w @gaming-platform/web --include-workspace-root
COPY apps/web apps/web

# NEXT_PUBLIC_* values are inlined into the client bundle by `next build`, so
# they are baked here rather than read from the running container. Override
# with --build-arg to publish an image pointed at a different chain.
ARG NEXT_PUBLIC_CHAIN_ID=11155111
ARG NEXT_PUBLIC_STAKE_POT_ADDRESS=0xa3Ff9Ef44aeD74C773Cb69692f334dD3cB3AE529
ARG NEXT_PUBLIC_EXPLORER_URL=https://sepolia.etherscan.io
ENV NEXT_PUBLIC_CHAIN_ID=$NEXT_PUBLIC_CHAIN_ID \
    NEXT_PUBLIC_STAKE_POT_ADDRESS=$NEXT_PUBLIC_STAKE_POT_ADDRESS \
    NEXT_PUBLIC_EXPLORER_URL=$NEXT_PUBLIC_EXPLORER_URL
RUN npm run build -w @gaming-platform/web \
  && rm -rf apps/web/.next/cache

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps-prod /app /app
COPY --from=builder /app/apps/web/.next apps/web/.next
COPY apps/web/public apps/web/public
COPY apps/web/next.config.ts apps/web/
COPY apps/web/scripts apps/web/scripts
COPY apps/web/migrations apps/web/migrations

# Everything else (Postgres, ADMIN_TOKEN) comes from environment variables;
# migrations run at boot, as they do for the server.
WORKDIR /app/apps/web
EXPOSE 4000

CMD ["sh", "-c", "node scripts/migrate.mjs && npm start"]
