# syntax=docker/dockerfile:1
# Build from the REPO ROOT (the lockfile lives there - npm workspaces):
#   docker build -f apps/webgames/Dockerfile .

# Debian, not alpine: the MetaMask SDK depends on bufferutil, which ships no
# musl prebuild and would have to be compiled from source on alpine.
FROM node:22-slim AS manifests
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/webgames/package.json apps/webgames/
COPY packages/core/package.json packages/core/

FROM manifests AS builder
RUN npm ci -w @gaming-platform/webgames --include-workspace-root

# core is consumed as dist/ and dist/ is not in the build context, so it has to
# be compiled here - before apps/webgames, so a client-only edit reuses this layer.
COPY packages/core packages/core
RUN npm run build -w @gaming-platform/core
COPY apps/webgames apps/webgames

# VITE_* values are inlined into the bundle at build time, so they are baked
# here rather than read from the running container. Override with --build-arg
# to publish an image pointed at a different chain or API.
ARG VITE_API_URL=https://api.playkombat.xyz
ARG VITE_CHAIN_ID=11155111
ARG VITE_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
ARG VITE_EXPLORER_URL=https://sepolia.etherscan.io
ARG VITE_WALLETCONNECT_PROJECT_ID=
ENV VITE_API_URL=$VITE_API_URL \
    VITE_CHAIN_ID=$VITE_CHAIN_ID \
    VITE_RPC_URL=$VITE_RPC_URL \
    VITE_EXPLORER_URL=$VITE_EXPLORER_URL \
    VITE_WALLETCONNECT_PROJECT_ID=$VITE_WALLETCONNECT_PROJECT_ID
RUN npm run build -w @gaming-platform/webgames

FROM nginx:1.29-alpine
COPY apps/webgames/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/webgames/dist /usr/share/nginx/html
EXPOSE 8080
