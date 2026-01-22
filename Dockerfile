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

# copy full source
COPY . .

# generate prisma client for build-time usage
RUN npx prisma generate --schema=prisma/schema.postgres.prisma

# build pixel extension
RUN npm run build:pixel

# build remix app
RUN npm run build

# ---- runner (final runtime image) ----
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Prisma needs OpenSSL at runtime
RUN apt-get update -y \
  && apt-get install -y openssl \
  && rm -rf /var/lib/apt/lists/*

# copy production node_modules
COPY --from=deps /app/node_modules ./node_modules

# copy remix build output
COPY --from=builder /app/build ./build

# copy prisma schema
COPY --from=builder /app/prisma ./prisma

# ✅ IMPORTANT: copy extensions (pixel dist lives here)
COPY --from=builder /app/extensions ./extensions

# copy package files
COPY --from=builder /app/package*.json ./

# generate prisma client in the final runtime image
RUN npx prisma generate --schema=prisma/schema.postgres.prisma

EXPOSE 3000

# ✅ Force bind + log env to confirm runtime behavior on Fly
CMD ["sh", "-lc", "echo \"BOOT: HOST=$HOST PORT=$PORT NODE_ENV=$NODE_ENV\" && HOST=0.0.0.0 PORT=${PORT:-3000} npm run start"]
