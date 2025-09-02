# ---- deps ----
FROM node:20-bookworm AS deps
WORKDIR /app
COPY package*.json ./
# Full dev deps for building
RUN npm ci

# ---- builder ----
FROM node:20-bookworm AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate Prisma client for Linux/OpenSSL 3.0
RUN npx prisma generate --schema=prisma/schema.postgres.prisma
# Build Remix
RUN npm run build

# ---- runner ----
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

# ✅ Install OpenSSL for Prisma on slim image
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Install *prod* deps only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy built app and Prisma artifacts
COPY --from=builder /app/build ./build
COPY --from=builder /app/prisma ./prisma
# Copy generated Prisma client + engines
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# (optional but you had these — harmless to keep)
COPY --from=builder /app/node_modules/@remix-run ./node_modules/@remix-run
COPY --from=builder /app/node_modules/@shopify ./node_modules/@shopify

EXPOSE 8080
CMD ["npm", "run", "start"]
