# ---------- deps: install all deps (including dev) ----------
FROM node:20-bookworm AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci

# ---------- builder: compile the app & generate Prisma client ----------
FROM node:20-bookworm AS builder
WORKDIR /app

# Bring in node_modules from deps
COPY --from=deps /app/node_modules ./node_modules

# Copy the rest of the source
COPY . .

# Prisma needs envs at *build time* just to run "generate".
# These are DUMMIES for build only; real values come from Fly secrets at runtime.
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/dummy?sslmode=disable&pgbouncer=true&connection_limit=1"
ENV DIRECT_URL="postgresql://user:pass@localhost:5432/dummy?sslmode=disable"

# Tell Prisma which schema to use (helps avoid picking up a different schema by accident)
ENV PRISMA_SCHEMA="prisma/schema.postgres.prisma"

# Generate Prisma client and build the Remix app
RUN npx prisma generate --schema=$PRISMA_SCHEMA
RUN npm run build

# ---------- runner: minimal image to run the server ----------
FROM node:20-bookworm-slim AS runner
WORKDIR /app

# Helpful system certs
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

# Only prod deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the built app & prisma bits
COPY --from=builder /app/build ./build
COPY --from=builder /app/prisma ./prisma

# Prisma engine binaries + client (keep these copies — they matter in slim images)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Some frameworks (Remix/Shopify) resolve packages at runtime; keep these vendor dirs
COPY --from=builder /app/node_modules/@remix-run ./node_modules/@remix-run
COPY --from=builder /app/node_modules/@shopify ./node_modules/@shopify

# Your server start command (Remix)
CMD ["npm", "run", "start"]
