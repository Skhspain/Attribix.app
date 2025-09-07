# ---- base (common) ----
FROM node:20-bookworm AS base
WORKDIR /app

# ---- deps (production deps only) ----
FROM base AS deps
COPY package*.json ./
RUN npm ci --omit=dev

# ---- builder (dev deps + build) ----
FROM base AS builder
COPY package*.json ./
RUN npm ci
COPY . .
# generate client here for type safety during build (fine)
RUN npx prisma generate --schema=prisma/schema.postgres.prisma
RUN npm run build:pixel
RUN npm run build

# ---- runner (final runtime image) ----
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Prisma needs OpenSSL available in the final image
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# copy prod deps, build output, prisma schema, package files
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package*.json ./

# IMPORTANT: generate Prisma Client in the final image (the one that actually runs)
RUN npx prisma generate --schema=prisma/schema.postgres.prisma

EXPOSE 8080
CMD ["npm", "run", "start"]
