# Build context is the repo root, not this directory: the runner is a
# workspace and consumes @gaming-platform/core from its built dist.
#
#   docker build -f apps/lobby-bots/Dockerfile -t kombat-lobby-bots .

FROM node:22-alpine AS builder
WORKDIR /repo

# Manifests first, so a source-only change does not reinstall the world.
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/lobby-bots/package.json apps/lobby-bots/
RUN npm ci --workspace @gaming-platform/core --workspace @gaming-platform/lobby-bots --include-workspace-root

COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY apps/lobby-bots apps/lobby-bots

RUN npm run build --workspace @gaming-platform/core \
 && npm run build --workspace @gaming-platform/lobby-bots

FROM node:22-alpine AS runtime
WORKDIR /repo
ENV NODE_ENV=production

# The workspace link node_modules/@gaming-platform/core points at
# packages/core, so that package has to come along with its dist.
COPY --from=builder /repo/node_modules node_modules
COPY --from=builder /repo/package.json ./
COPY --from=builder /repo/packages/core/package.json packages/core/
COPY --from=builder /repo/packages/core/dist packages/core/dist
COPY --from=builder /repo/apps/lobby-bots/package.json apps/lobby-bots/
COPY --from=builder /repo/apps/lobby-bots/dist apps/lobby-bots/dist

USER node
WORKDIR /repo/apps/lobby-bots

# Every knob is an env var; the image ships no .env. On Docker Desktop the
# API on the host is reachable at host.docker.internal.
ENV BOTS_SERVER_URL=http://host.docker.internal:3000

CMD ["node", "dist/main.js"]
