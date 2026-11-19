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

# Injected at build time (docker build --build-arg SUBHUB_BUILD_ID=$(git rev-parse --short HEAD))
# and surfaced by GET /health so you can tell which revision is running.
ARG SUBHUB_BUILD_ID=dev
ENV SUBHUB_BUILD_ID=$SUBHUB_BUILD_ID

# node:22-slim ships without curl/wget, so probe /health with Node's built-in fetch.
# A 503 (database unreachable) marks the container unhealthy; plain Docker will not
# auto-restart on unhealthy, which is intentional to avoid crash loops.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server/index.js"]
