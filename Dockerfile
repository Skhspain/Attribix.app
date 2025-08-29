# ---------------------
# deps stage (install all deps incl. dev)
# ---------------------
FROM node:20-slim AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps

# ---------------------
# build stage
# ---------------------
FROM node:20-slim AS build
WORKDIR /app

# Bring node_modules from deps
COPY --from=deps /app/node_modules ./node_modules
# Copy source
COPY . .

# Generate Prisma client (prod schema) for build tools that import it
RUN npx --yes prisma generate --schema=prisma/schema.prod.prisma

# Build Remix app (creates build/server/index.js & build/client/*)
RUN npm run build

# ---------------------
# runtime stage
# ---------------------
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

# Install only production deps
COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps

# Silence Prisma OpenSSL warnings & keep certs up to date
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Copy built artefacts and required runtime files
COPY --from=build /app/build   ./build
COPY --from=build /app/public  ./public
COPY --from=build /app/prisma  ./prisma
COPY --from=build /app/app     ./app

# ✅ Generate Prisma client in the *runtime* image against prod schema
RUN npx --yes prisma generate --schema=prisma/schema.prod.prisma

EXPOSE 8080

# Keep runtime simple; schema is applied by Fly's release_command
CMD ["npm", "run", "start"]
