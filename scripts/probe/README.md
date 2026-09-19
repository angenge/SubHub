# sing-box 节点探测/自动切换 watchdog

通过 sing-box 的 **Clash API** 对 `🚀 节点选择` 做健康与带宽巡检：探测当前选中节点，
达标则保持（粘滞），故障或带宽低于阈值则按 `🧪 节点探针` 的延迟排行榜依次切换并实测，
首个达标节点被钉住。用于为长稳网络环境提供「单一主节点 + 即时故障切换」的自动运维。

## 前置依赖

- Node.js ≥ 18 与 [tsx](https://www.npmjs.com/package/tsx)（发行机：`npm i -g tsx` 或放入项目后 `npx tsx`）
- `curl` 在 PATH 中（Windows 自带 curl.exe，Linux 通常自带）
- 能访问 sing-box 的 Clash API 端口（默认 `192.168.68.100:9090`）与被代理的入口（默认 `192.168.68.100:1080`）

## 快速开始

```bash
# 1) 干跑（只读 + 只测不切，验证连通性与判定逻辑），第一条巡检结束后自动退出
CLASH_SECRET=<secret> DRY_RUN=1 npx tsx scripts/probe/watchdog.ts

# 2) 单次真实巡检（会被切换选择器，可挂 cron 每小时执行 N 次）
CLASH_SECRET=<secret> MAX_TICKS=1 npx tsx scripts/probe/watchdog.ts

# 3) 常驻守护（默认每 90s 巡检一次，放 tmux/screen/systemd 中运行）
CLASH_SECRET=<secret> npx tsx scripts/probe/watchdog.ts
```

## Docker 运行（直接从 GitHub 拉取最新 watchdog）

源码托管在 `https://github.com/angenge/SubHub`，以下两种方式均无需本地存放脚本，启动时/构建时从 GitHub 拉取 `scripts/probe/watchdog.ts`。

> 注意：容器内 `127.0.0.1` 指容器自身而非宿主机。若 watchdog 与 sing-box 部署在同一台机器，
> 建议加 `--network host`（Linux）让示例中的 `127.0.0.1` 直接可用；否则需把
> `CLASH_HOST`/`PROXY` 改为宿主机可达地址（例如 `http://192.168.68.100:9090`、`socks5h://192.168.68.100:1080`）。

### 方式一：Dockerfile（构建时拉取，docker run 即常驻）

```dockerfile
FROM node:22-alpine
RUN apk add --no-cache curl \
    && npm i -g tsx \
    && curl -fsSL -o /srv/watchdog.ts \
       https://raw.githubusercontent.com/angenge/SubHub/main/scripts/probe/watchdog.ts
WORKDIR /srv
CMD ["tsx", "watchdog.ts"]
```

```bash
docker build -t subhub-watchdog .
docker run -d --name subhub-watchdog --restart always --network host \
  -e CLASH_SECRET=<secret> \
  -e CLASH_HOST=http://127.0.0.1:9090 \
  -e PROXY=socks5h://127.0.0.1:1080 \
  subhub-watchdog
```

### 方式二：免构建单命令（每次启动时拉到容器内再执行）

```bash
docker run -d --name subhub-watchdog --restart always --network host \
  -e CLASH_SECRET=<secret> \
  -e CLASH_HOST=http://127.0.0.1:9090 \
  -e PROXY=socks5h://127.0.0.1:1080 \
  node:22-alpine \
  sh -c "npm i -g tsx >/dev/null 2>&1 && \
         curl -fsSL https://raw.githubusercontent.com/angenge/SubHub/main/scripts/probe/watchdog.ts -o /tmp/watchdog.ts && \
         tsx /tmp/watchdog.ts"
```

查看日志：

```bash
docker logs -f --tail 50 subhub-watchdog
```

## 工作原理

一个巡检周期：

1. `GET /proxies` 读取 `🚀 节点选择` 的当前选中节点（`now`）与 `🧪 节点探针` 的延迟排行榜。
2. 通过代理入口（`socks5h://…:1080`）对当前节点下载 Cloudflare 直连测速文件（默认 5MB）。
   - 下载成功且带宽 `>= MIN_SPEED_MBPS` → 健康，保持现状（粘滞，不主动跳到更优节点）。
   - 下载失败/超时 → 立即复测一次；仍失败判为 `down`。
   - 带宽低于阈值判为 `slow`。
3. 判定失败后按延迟排行榜（无延迟记录者排最后）逐个候选：
   - `PUT /proxies/🚀 节点选择` 切换到候选 → 立刻通过代理实测候选 → 首个达标者钉住并结束本轮。
   - 不达标/失败的候选进入坏节点冷却（`BAD_NODE_COOLDOWN_MIN` 内跳过）。
   - 全部候选失败 → 保持当前选择并进入 hold 窗口，待下轮再试。
4. 防抖：`SWITCH_WINDOW_MIN` 窗口内切换次数达到 `MAX_SWITCHES` 即进入 hold，避免抖动。

手动在面板/yacd 改选节点会被自动尊重：每轮只测当前 `now`，达标就保持。

## 环境变量

| 变量 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `CLASH_SECRET` | （必填） | sing-box Clash API 密钥（与面板一致），不设置时仅告警 |
| `CLASH_HOST` | `http://192.168.68.100:9090` | Clash API 基地址 |
| `PROXY` | `socks5h://192.168.68.100:1080` | 探测流量的代理入口（在 VPS 本机跑可用 `socks5h://127.0.0.1:1080`） |
| `SPEED_URL` | `https://speed.cloudflare.com/__down?bytes=5242880` | 带宽测速源（默认 5MB） |
| `MIN_SPEED_MBPS` | `10` | 达标带宽阈值，低于即判定 `slow` |
| `INTERVAL_SEC` | `90` | 常驻模式的巡检间隔 |
| `PROBE_TIMEOUT_SEC` | `40` | 当前节点测速超时 |
| `FAILOVER_TIMEOUT_SEC` | `20` | 切换候选时测速超时（更短以加速扫描） |
| `MAX_SWITCHES` | `3` | hold 窗口内最大切换次数 |
| `SWITCH_WINDOW_MIN` | `5` | 防抖窗口长度 |
| `BAD_NODE_COOLDOWN_MIN` | `10` | 坏节点被跳过的时间 |
| `DRY_RUN` | `0`/`1` | `1` = 只读演练，不执行切换 |
| `MAX_TICKS` | `0`（无限） | 执行 N 轮后退出，`1` 可用于 cron 单次巡检 |

## systemd 常驻示例

```ini
[Unit]
Description=SubHub sing-box node watchdog
After=network-online.target

[Service]
Environment=CLASH_SECRET=<secret>
Environment=CLASH_HOST=http://127.0.0.1:9090
Environment=PROXY=socks5h://127.0.0.1:1080
WorkingDirectory=/opt/subhub-probe
ExecStart=/usr/bin/env npx tsx scripts/probe/watchdog.ts
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

## 日志

全部输出到 stdout（每行带 UTC 时间戳，前缀 `[probe]`）。systemd 下用
`journalctl -u subhub-watchdog -f` 查看；直接运行则重定向到文件即可。