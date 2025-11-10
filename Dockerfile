# --- Builder ---
FROM node:18-alpine AS builder
WORKDIR /app

# System deps sometimes needed by Prisma/OpenSSL
RUN apk add --no-cache openssl

# Install deps
COPY package.json package-lock.json* ./
# Use npm install to avoid CI lockfile strictness in remote builders
RUN npm install

# Build the app
COPY . .
RUN npm run build

# Generate Prisma client (dev deps are present in builder stage)
RUN npx prisma generate


# --- Runtime ---
FROM node:18-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Install only production deps
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

# App artifacts
COPY --from=builder /app/build ./build
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

# Prisma engines copied from builder so runtime doesn't need dev deps
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3000
CMD ["npm", "run", "start"]
