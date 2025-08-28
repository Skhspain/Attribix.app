# ---------------------
# deps stage
# ---------------------
FROM node:20-slim AS deps
WORKDIR /app

# Install deps
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# ---------------------
# build stage
# ---------------------
FROM deps AS build
WORKDIR /app

# Copy source
COPY . .

# Generate Prisma client for PROD (Postgres schema)
RUN npx prisma generate --schema=prisma/schema.prod.prisma

# Build Remix app (creates build/server/index.js & build/client/*)
RUN npm run build

# ---------------------
# runtime stage
# ---------------------
FROM node:20-slim AS runner
WORKDIR /app

# Runtime env (Fly expects 0.0.0.0:8080)
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

# Install only production deps
COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps

# Copy built artefacts and required runtime files
COPY --from=build /app/build    ./build
COPY --from=build /app/public   ./public
COPY --from=build /app/prisma   ./prisma
COPY --from=build /app/app      ./app

EXPOSE 8080

# Run DB migrations (safe if already applied), then start Remix
CMD sh -c "npx prisma migrate deploy --schema=prisma/schema.prod.prisma && npm run start"
