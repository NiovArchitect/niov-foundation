# Foundation API container — Node 22.11 + tsx-served Fastify.
#
# Build:
#   docker build -t niov/foundation-api:dev .
#
# Run (single container against an external Postgres):
#   docker run --rm -p 3000:3000 \
#     -e DATABASE_URL=postgresql://otzar:otzar@host.docker.internal:5433/foundation_test \
#     -e JWT_SECRET=dev-only \
#     -e ENCRYPTION_KEY=dev-only-32-byte-encryption-key-x \
#     niov/foundation-api:dev
#
# Run via docker-compose.local.yml for the full local stack
# (postgres + control-tower + python + beam).

# --- Stage 1: deps + Prisma client generation -------------------------------
FROM node:22.11-bookworm-slim AS deps

ENV NODE_ENV=production
WORKDIR /repo

# OpenSSL is required by Prisma's binary at install time on slim images.
# ca-certificates supports HTTPS fetches from any npm scope.
RUN apt-get update && \
    apt-get install -y --no-install-recommends openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Copy lockfile + workspace package.jsons first so npm ci can cache.
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/database/package.json packages/database/package.json

# Include dev deps too — tsx is a dev dep but we need it at runtime since the
# API runs TS directly via `npm start` (= `tsx src/server.ts`).
RUN --mount=type=cache,target=/root/.npm \
    NODE_ENV=development npm ci --no-audit --no-fund

# Copy the Prisma schema BEFORE generating the client so the generator sees it.
COPY packages/database/prisma packages/database/prisma
COPY packages/database/tsconfig.json packages/database/tsconfig.json
COPY packages/database/src packages/database/src
RUN npm --workspace @niov/database run db:generate

# --- Stage 2: runtime --------------------------------------------------------
FROM node:22.11-bookworm-slim AS runtime

# tini for clean PID 1 signal handling. OpenSSL is required by Prisma's
# generated client at runtime. ca-certificates supports outbound HTTPS.
RUN apt-get update && \
    apt-get install -y --no-install-recommends tini curl openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3000 \
    NPM_CONFIG_LOGLEVEL=warn

WORKDIR /repo

# Bring the hoisted root node_modules over. npm workspaces hoist everything
# to the repo root by default, so we only need this single COPY. (The
# per-workspace node_modules dirs only exist when there are conflicting
# versions; in this repo they don't.)
COPY --from=deps /repo/node_modules ./node_modules

# Copy source. We deliberately don't precompile — apps/api runs via tsx, so
# TS source IS the deployable.
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY packages/auth packages/auth
COPY packages/database packages/database

# Non-root runtime
RUN groupadd --system --gid 1001 niov && \
    useradd --system --uid 1001 --gid niov --home /repo niov && \
    chown -R niov:niov /repo
USER niov

EXPOSE 3000

# /health is a public Fastify route — see apps/api/src/routes/health.routes.ts.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://localhost:3000/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npm", "--workspace", "@niov/api", "run", "start"]
