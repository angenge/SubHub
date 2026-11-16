# Build stage
# Debian slim (glibc): better-sqlite3 ships prebuilt binaries for glibc, so in
# practice no compilation happens. The toolchain below stays in this stage
# only, as a compile fallback, and never reaches the final image.
FROM node:22-slim AS builder

WORKDIR /app

# Build dependencies for native modules (better-sqlite3), builder stage only
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

# Production stage
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATA_DIR=/app/data

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

VOLUME ["/app/data"]
EXPOSE 3000

CMD ["node", "dist/server/index.js"]
