# CHROTE Multiplayer - Production Dockerfile
FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

# Build UI
FROM base AS ui-builder
COPY --from=deps /app/node_modules ./node_modules
COPY ui ./ui
WORKDIR /app/ui
RUN bun install && bun run build

# Build server
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun build src/server/index.ts --outdir=dist --target=bun

# Production image
FROM base AS runner
ENV NODE_ENV=production

# Copy built artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/db ./db
COPY --from=ui-builder /app/ui/dist ./ui/dist

# Create data directory
RUN mkdir -p /app/data

EXPOSE 3000
CMD ["bun", "run", "dist/index.js"]
