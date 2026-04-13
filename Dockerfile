# SmartCart Main App Dockerfile
# Express + tRPC backend with Vite-built React frontend (single process)

FROM node:22-alpine AS base

# ── Install deps ──────────────────────────────────────────────────────
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* ./
COPY patches ./patches/
# Try pnpm first, fall back to npm
RUN if [ -f pnpm-lock.yaml ]; then \
      corepack enable pnpm && pnpm install --frozen-lockfile; \
    else \
      npm ci; \
    fi

# ── Build ─────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build Vite frontend + esbuild backend in one step
RUN if [ -f pnpm-lock.yaml ]; then \
      corepack enable pnpm && pnpm run build; \
    else \
      npm run build; \
    fi

# ── Production ────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache curl
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 smartcart

# Copy only what's needed to run
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/drizzle ./drizzle

USER smartcart

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:${PORT:-3000}/ || exit 1

CMD ["node", "dist/index.js"]
