# ---- deps ----
FROM node:20-bookworm AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ---- builder ----
FROM node:20-bookworm AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# ensure prisma generates for linux here
RUN npx prisma generate --schema=prisma/schema.postgres.prisma
RUN npm run build

# ---- runner ----
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# keep only prod deps in runner
COPY package*.json ./
RUN npm ci --omit=dev
# copy build artifacts + prisma client
COPY --from=builder /app/build ./build
COPY --from=builder /app/prisma ./prisma
# Prisma client lives in node_modules; ensure it matches the generated one
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/@remix-run ./node_modules/@remix-run
COPY --from=builder /app/node_modules/@shopify ./node_modules/@shopify

EXPOSE 8080
CMD ["npm", "run", "start"]
