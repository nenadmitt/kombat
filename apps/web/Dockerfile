# syntax=docker/dockerfile:1
# Build from the REPO ROOT (the lockfile lives there - npm workspaces):
#   docker build -f apps/web/Dockerfile .

FROM node:22-alpine AS manifests
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/

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

# `output: standalone` traces the modules the server actually imports and emits
# them next to it, so the runtime never needs a node_modules install. Static
# assets are the documented exception - they are not traced.
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static apps/web/.next/static
COPY --from=builder /app/apps/web/public apps/web/public

# migrate.mjs is not part of the traced graph; dotenv is its only dependency
# the server does not already pull in.
COPY --from=builder /app/node_modules/dotenv node_modules/dotenv
COPY apps/web/scripts apps/web/scripts
COPY apps/web/migrations apps/web/migrations

# Everything else (Postgres, ADMIN_TOKEN) comes from environment variables;
# migrations run at boot, as they do for the server.
WORKDIR /app/apps/web
ENV PORT=4000 HOSTNAME=0.0.0.0
EXPOSE 4000

CMD ["sh", "-c", "node scripts/migrate.mjs && node server.js"]
