# SubHub 🌐

> 现代化、轻量级、全功能的代理节点与订阅聚合管理平台。  
> 帮助你一站式管理多机场订阅、真实网络测速、智能过滤去重与多客户端统一转换分发。

---

## 📖 简介

在多节点管理与订阅分发场景中，用户常常面临以下痛点：
- **机场订阅分散**：拥有多家机场或自建 VPS 节点，不同客户端间切换订阅极为繁琐；
- **失效节点泛滥**：节点经常超时/断流，缺乏直观筛选剔除机制；
- **云端测速失真**：云端机房测速反映的是境外数据中心延迟，无法代表国内家庭宽带/移动网络的真实体验；
- **跨客户端配置繁重**：不同设备使用 Clash、Sing-box、Surge、Loon 等客户端，各格式配置不互通；
- **命名混乱无序**：各服务商节点命名规则不一，缺乏统一格式化与国旗标识。

**SubHub** 为此而生！它是一个轻量级、开箱即用的**订阅聚合与节点调度中枢**。只需将你的机场订阅导入 SubHub，即可自动解析、持续测速、按需过滤与正则改名，生成专属的永久聚合订阅链接，并根据客户端类型自动适配返回最佳格式。

---

## 🏛️ 系统架构设计

SubHub 采用现代化的**「云端中枢调度 + 本地边缘真实探针」**分离架构，兼顾 0 成本高可用与本地真实网络测速：

```
┌─────────────────────────────────────────────────────────────┐
│             Cloudflare 全球边缘网络 (SubHub 云端中枢)         │
│                                                             │
│  [Web 可视化控制台] ──(查看/管理)──> [Cloudflare D1 数据库]  │
│  [多端客户端订阅]   <──(适配分发)── [聚合与规则过滤流水线]   │
│                                           ▲                 │
│                                           │ 定期回传延迟    │
└───────────────────────────────────────────┼─────────────────┘
                                            │ REST API (Token)
┌───────────────────────────────────────────┴─────────────────┐
│        本地设备 / 边缘节点 (家庭软路由 / NAS / 个人小主机)    │
│                                                             │
│   [SubHub Probe Agent 探针客户端]                           │
│   ├── 定时调度 (每 15 分钟触发一次)                          │
│   ├── 受控并发 URL-Test 探针池 (默认 3 并发, 8 秒超时)       │
│   └── 本地宽带真实握手延迟测算 (电信 / 联通 / 移动 / 校园网) │
└─────────────────────────────────────────────────────────────┘
```

---

## ✨ 核心特性

- 🚀 **全格式自动解析**
  - 支持 **Clash (YAML)**、**Sing-box (JSON)**、**Base64** 编码及**原生节点 URI 列表**（VLESS、VMess、Trojan、Shadowsocks、Hysteria2、AnyTLS）。
  - 自动提取订阅响应头中的流量信息（已用/总量）及过期时间。
- 📡 **三维立体测速与健康检测**
  - **边缘探针分布式测速**：在软路由/NAS 运行 `probe.js`，测算真实家用宽带延迟并自动剔除坏节点；
  - **客户端动态优选**：自动生成 `⚡ 自动选择`（URL-Test / Fallback）策略组，客户端运行时毫秒级自动切优；
  - **服务端并发测速**：在 VPS 部署模式下支持 Web 控制台一键发起中心化测速。
- 🛠️ **智能聚合流水线**
  - **多源汇聚**：任意勾选/组合多个启用状态的订阅源。
  - **精细过滤**：支持协议白名单、包含关键词、排除关键词、最大允许延迟过滤（基于真实测速结果）。
  - **智能去重**：自动根据节点 IP + 端口去重，合并冗余节点。
  - **正则改名**：自定义多重正则表达式，批量格式化节点名称与国家旗帜。
- 🔄 **多客户端智能自适应**
  - 生成单一永久聚合 Token 链接（`/sub/:token`）。
  - **自动 UA 识别**：根据请求来源（Clash.Meta、Sing-box、Surge、Loon、Shadowrocket 等）自动返回匹配格式。
  - 也可通过 URL 参数显式指定：`?target=clash|singbox|surge|loon|base64`。
- 📱 **全终端响应式现代 UI**
  - 完美适配手机、平板与桌面端，支持移动端专用底部导航栏与卡片视图。
- 📦 **双轨部署架构**
  - 支持 **Cloudflare Workers + D1 + Assets** 0 成本全球 Serverless 边缘部署；
  - 亦支持 **Docker / Docker Compose / VPS Node.js** 本地常驻部署。

---

## 🎯 典型使用场景

1. **多机场整合**：将多个付费机场和自建 VPS 节点整合为一个统一的聚合链接；
2. **基于真实宽带剔除失效节点**：本地软路由定期测速，云端聚合自动剔除超时节点与高延迟节点；
3. **团队 / 家庭共享**：统一维护订阅，为不同成员或设备分发专属聚合规则；
4. **全平台无缝切换**：同一条聚合订阅链接，在 iOS (Surge/Loon/Shadowrocket)、Android (Clash/Sing-box)、Windows/macOS 客户端上均可直接导入。

---

## 🚀 快速启动指南

先克隆仓库到本地：
```bash
git clone https://github.com/angenge/SubHub.git
cd SubHub
```

你可以根据实际情况选择以下任一方式完成部署：

---

### 方式一：Cloudflare 全球边缘部署（强烈推荐，0 成本 / 免服务器 / 永久在线）

SubHub 原生兼容 Cloudflare Workers + D1 数据库 + Static Assets 静态托管架构：

#### 步骤 1：登录 Wrangler
```bash
npx wrangler login
```

#### 步骤 2：创建 D1 数据库并初始化
```bash
# 创建 D1 数据库 (记录终端输出的 database_id)
npx wrangler d1 create subhub-db

# 执行数据库表结构初始化 (两个迁移必须按顺序全部执行)
npx wrangler d1 execute subhub-db --remote --file=./migrations/0000_init_d1.sql
npx wrangler d1 execute subhub-db --remote --file=./migrations/0001_update_interval_180_and_skipped.sql
```

> ⚠️ 请务必执行 **两个** 迁移脚本：`0001` 会新增 `sync_logs.skipped` / `skipped_detail` 两列，
> 若遗漏，首次同步订阅时会报 `no such column: skipped`。

#### 步骤 3：配置 `wrangler.jsonc`
检查根目录下的 `wrangler.jsonc` 文件：
- 将 `database_id` 替换为你刚刚创建的 D1 数据库 ID；
- 将 `routes` 中的 `subhub.hiz.one` 替换为你自己的域名（若不需要自定义域名，可直接删除 `routes` 节点使用 Cloudflare 默认分配的 `*.workers.dev` 域名）。

#### 步骤 4：构建与一键发布
```bash
# 编译前端静态页面与服务端代码
npm install
npm run build

# 部署至 Cloudflare 全球边缘网络
npx wrangler deploy
```

部署完成后，即可通过你的自定义域名或 Cloudflare 提供的 Worker 域名直接访问！

> 💡 *(可选)* 如需固定管理员密码（跳过网页初始化），在 Workers 上需通过 Secret 注入，
> 而不是 `docker-compose.yml` 里的环境变量：
> ```bash
> npx wrangler secret put ADMIN_PASSWORD
> ```
> 设置后需重新 `npx wrangler deploy` 才会生效。

---

### 方式二：Docker 一键部署（适合 VPS / 私有服务器）

#### 1. 使用 Docker Compose（最便捷）
```bash
# 构建并后台启动
docker compose up -d --build
```

#### 2. 使用标准 Docker 命令
```bash
# 1. 构建本地镜像
docker build -t subhub:latest .

# 2. 运行容器
docker run -d \
  --name subhub \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  --restart unless-stopped \
  subhub:latest
```

启动完成后，在浏览器访问 `http://<你的服务器IP>:3000` 即可进入管理后台。

#### 3. 健康检查

镜像内置了 `HEALTHCHECK`，每 30 秒探测一次 `/health`：

```bash
docker ps --format '{{.Names}}\t{{.Status}}'     # 期望 Up ... (healthy)
docker inspect subhub --format '{{.State.Health.Status}}'
```

`GET /health` 会真实执行一次 SQLite/D1 查询，返回：

```json
{
  "status": "ok",
  "version": "1.0.0",
  "build": "8ad0eee",
  "platform": "node",
  "db": true,
  "latencyMs": 1,
  "time": "2026-11-19T12:00:00.000Z"
}
```

| 情况 | HTTP | 含义 |
| :--- | :--- | :--- |
| 数据库正常 | `200` | 容器标记为 `healthy` |
| 数据库不可用 | `503` | 容器标记为 `unhealthy`，`status` 为 `degraded` |

> 提示：原生 Docker 在容器变为 `unhealthy` 时**不会自动重启**，只会改变状态显示（避免数据库损坏时陷入重启风暴）。如需自动重启，可配合 `willfarrell/autoheal` 之类的守护容器。

构建时可以把当前版本号写进 `build` 字段，便于确认线上跑的是哪个提交：

```bash
docker build --build-arg SUBHUB_BUILD_ID=$(git rev-parse --short HEAD) -t subhub:latest .
```

---

### 方式三：本地 / Linux 服务器直接运行 (Node.js)

#### 前置要求
- **Node.js** >= 20.x（推荐 22.x，Docker 镜像固定使用 `node:22-slim`）
- **npm** / **pnpm**
- 其他运行时（如 Bun）未经验证：本项目依赖 `better-sqlite3` 原生模块，非 Node 运行时可能需要额外编译

#### 安装与启动
```bash
# 1. 安装依赖
npm install

# 2. 编译打包 (前端 SPA + 后端 API)
npm run build

# 3. 启动生产服务
npm start
```
服务默认监听 `http://localhost:3000`。

#### 开发调试模式
```bash
# 启动前端开发服务器 (带热重载与后端 API 自动代理，默认端口 5173)
npm run dev

# 另起终端启动后端 API 服务 (默认端口 3000)
npm run dev:server
```

#### 运行测试

内置完整的核心引擎测试套件（协议解析、格式转换、过滤去重、改名、性能基准等）：

```bash
npm test
```

测试覆盖 `src/core/__tests__/comprehensive_suite.ts`，任意用例失败时进程以非 0 状态码退出。

---

## 📡 边缘测速探针运行指南 (SubHub Probe Agent)

为了让 Cloudflare 云端聚合能够根据你**本地真实的宽带环境**筛选可用节点，可以在家里的软路由、NAS 或个人电脑上运行轻量探针：

1. 打开 SubHub Web 控制台，进入「节点工作台」点击 **「📡 边缘探针配置」** 获取你的专属探针密钥；
2. 在本地设备执行启动：

```bash
# 方式 1：Docker 一键常驻运行（推荐）
docker run -d \
  --name subhub-probe \
  --restart unless-stopped \
  -e SUBHUB_URL="https://your-subhub-domain.com" \
  -e AGENT_SECRET="subprobe_your_secret_here" \
  -e INTERVAL_MINUTES=15 \
  node:20-alpine sh -c "wget -qO probe.js https://your-subhub-domain.com/probe.js && node probe.js"

# 方式 2：Node.js 单文件直接运行 (0 外部 npm 依赖)
curl -fsSL https://your-subhub-domain.com/probe.js -o probe.js
SUBHUB_URL="https://your-subhub-domain.com" AGENT_SECRET="subprobe_your_secret_here" node probe.js
```

---

## 🧭 初次使用步骤

1. **初始化管理员密码**：
   - 首次打开 Web 控制台，系统会自动弹出管理员密码初始化界面，设置密码后即可登录。
   - *(可选)* 也可通过环境变量 `ADMIN_PASSWORD=your_password` 预设固定密码。
2. **添加机场订阅源**：
   - 进入「订阅源管理」页面，点击「添加订阅」，填入机场提供的订阅链接并保存；
   - 系统将自动拉取、解析全部节点信息并记录流量配额与到期时间。
3. **创建聚合分发规则**：
   - 进入「聚合分发中心」页面，点击「新建聚合」；
   - 勾选订阅源，设置过滤条件（协议白名单、包含/排除关键词、延迟阈值、正则改名等）；
   - 保存后即可复制生成的专属聚合链接（`/sub/<Token>`）。
4. **在客户端中导入**：
   - 将聚合订阅链接直接填入 Clash / Mihomo / Sing-box / Surge / Loon / Shadowrocket 客户端中；
   - 服务端会自动识别客户端类型并返回专属适配格式，即刻畅享高速连接！

---

## ⚙️ 环境变量说明

| 变量名 | 默认值 | 适用平台 | 说明 |
| :--- | :--- | :--- | :--- |
| `PORT` | `3000` | Node.js / Docker | 服务监听端口 |
| `HOST` | `0.0.0.0` | Node.js / Docker | 服务监听主机地址 |
| `DATA_DIR` | `./data` | Node.js / Docker | SQLite 数据库文件持久化路径 |
| `ADMIN_PASSWORD` | *(空)* | 全平台 | 固定管理员密码（设置后跳过 Web 初始化）。Workers 上须通过 `npx wrangler secret put ADMIN_PASSWORD` 注入 |
| `ENABLE_TCP_PING` | *(自动)* | 全平台 | 服务端 TCP Ping 测速开关 (`true`/`false`)。Cloudflare Workers 上默认关闭（`node:net` 出站 TCP 可用，但默认不启用） |
| `TRUST_PROXY` | *(空)* | Node.js / Docker | 部署在反向代理（Nginx / Caddy / Cloudflare Tunnel）之后请设为 `true`，否则限流会把所有请求识别为同一个 IP |

#### 边缘探针环境变量 (`agent/probe.js`)

| 变量名 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `SUBHUB_URL` | *(必填)* | SubHub 实例地址，例如 `https://subhub.example.com` |
| `AGENT_SECRET` | *(必填)* | 在「📡 边缘探针配置」中获取的专属探针密钥 |
| `INTERVAL_MINUTES` | `15` | 每轮测速的间隔（分钟） |
| `CONCURRENCY` | `3` | 节点测速并发数 |
| `TIMEOUT_MS` | `8000` | 单节点 URL-Test 超时（毫秒） |
| `FETCH_TIMEOUT_MS` | `15000` | 拉取待测节点列表的请求超时（毫秒） |

---

## 🔌 支持的协议与客户端格式

### 支持的节点协议
- **VLESS** (XTLS Vision / Reality / WebSocket / gRPC)
- **VMess** (TCP / WebSocket / gRPC)
- **Trojan** (TLS / WebSocket / gRPC)
- **Shadowsocks (SS)** (含 SIP002、v2ray-plugin、obfs 插件)
- **Hysteria 2 (Hy2)** (含 Salamander 混淆)
- **AnyTLS** (含 uTLS 指纹 / ALPN)

### 支持的客户端导出格式
- **Clash / Clash Meta (Mihomo)** (`target=clash`)
- **Sing-box** (`target=singbox`)
- **Surge** (`target=surge`)
- **Loon** (`target=loon`)
- **通用 Base64 / URI 列表** (`target=base64`)

---

## 🛠️ 技术栈

- **Core Engine**：TypeScript 协议解析、转换与规则过滤引擎
- **Backend**：Node.js / Cloudflare Workers + [Hono](https://hono.dev/) + [Drizzle ORM](https://orm.drizzle.team/) + [Better-SQLite3](https://github.com/WiseLibs/better-sqlite3) / [Cloudflare D1](https://developers.cloudflare.com/d1/)
- **Frontend**：React 18 + Vite 6 + TailwindCSS 3 + Lucide Icons + Recharts
- **Container**：Docker + Multi-stage Build

---

## 📄 开源许可证

本项目基于 [MIT](LICENSE) 许可证开源。
