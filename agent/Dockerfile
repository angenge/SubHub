FROM node:20-alpine

# 安装必要依赖并自动适配 CPU 架构下载最新稳定版 Mihomo (Clash.Meta) 二进制
RUN apk add --no-cache curl gzip ca-certificates \
    && ARCH=$(uname -m | sed 's/x86_64/amd64/' | sed 's/aarch64/arm64/' | sed 's/armv7l/armv7/') \
    && MIHOMO_VER="v1.19.31" \
    && echo "Downloading Mihomo ${MIHOMO_VER} for ${ARCH}..." \
    && (curl -fsSL "https://github.com/MetaCubeX/mihomo/releases/download/${MIHOMO_VER}/mihomo-linux-${ARCH}-${MIHOMO_VER}.gz" || curl -fsSL "https://ghfast.top/https://github.com/MetaCubeX/mihomo/releases/download/${MIHOMO_VER}/mihomo-linux-${ARCH}-${MIHOMO_VER}.gz") | gzip -d > /usr/local/bin/mihomo \
    && chmod +x /usr/local/bin/mihomo \
    && mihomo -v

WORKDIR /app

COPY probe.js ./

ENV SUBHUB_URL=""
ENV AGENT_SECRET=""
ENV INTERVAL_MINUTES=15
ENV CONCURRENCY=2
ENV TIMEOUT_MS=8000
ENV TEST_URL="https://cp.cloudflare.com/generate_204"

ENTRYPOINT ["node", "probe.js"]
