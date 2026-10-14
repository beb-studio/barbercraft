# ==============================================================================
# BarberCraft Production Multi-Stage Dockerfile
# Produces an optimized, hardened, non-root standalone container image.
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. Base Stage: Node.js runtime with pnpm package manager
# ------------------------------------------------------------------------------
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@11.12.0 --activate
WORKDIR /app

# ------------------------------------------------------------------------------
# 2. Dependencies Stage: Fetch and cache production dependencies
# ------------------------------------------------------------------------------
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ------------------------------------------------------------------------------
# 3. Builder Stage: Compile TypeScript and build Next.js standalone bundle
# ------------------------------------------------------------------------------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Dummy build-time secrets to satisfy static phase validation
ENV BETTER_AUTH_SECRET=build_time_placeholder_secret_at_least_32_characters_long
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/build_db
ENV APP_BASE_URL=https://barbercraft.local

RUN pnpm build

# ------------------------------------------------------------------------------
# 4. Runner Stage: Hardened, minimal non-root production container
# ------------------------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1

# Create unprivileged system group and user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy static assets and standalone bundle
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

# Drop to non-root user
USER nextjs

EXPOSE 3000

# Default entrypoint starts Next.js standalone web server
CMD ["node", "server.js"]
