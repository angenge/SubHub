# SubHub 🌐

> 现代化、轻量级、全功能的代理节点与订阅聚合管理平台。  
> 帮助你一站式管理多机场订阅、节点健康检测、智能过滤去重与多客户端统一转换分发。

---

## 📖 简介

在科学上网与多节点管理场景中，许多用户常常面临以下痛点：
- **机场订阅分散**：拥有多家机场或自建节点，客户端切换订阅繁琐；
- **失效节点泛滥**：节点经常超时/断流，无法直观筛除；
- **跨客户端配置繁重**：不同设备使用 Clash、Sing-box、Surge、Loon 等不同客户端，各格式配置不互通；
- **命名混乱无序**：各服务商节点命名不一，缺乏统一分类与标识。

**SubHub** 为此而生！它是一个轻量级、开箱即用的**订阅聚合与节点调度中枢**。只需将你的机场订阅导入 SubHub，即可自动解析、持续测速、按需过滤与正则改名，生成专属的永久聚合订阅链接，并根据客户端类型自动适配返回最佳格式。

---

## ✨ 核心特性

- 🚀 **全格式自动解析**
  - 支持 **Clash (YAML)**、**Sing-box (JSON)**、**Base64** 编码及**原生节点 URI 列表**（VLESS、VMess、Trojan、Shadowsocks、Hysteria2）。
  - 自动提取订阅响应头中的流量（已用/总量）及过期时间等信息。
- ⚡ **TCP Ping 实时测速与健康检测**
  - 高并发多节点延迟探针与批量健康检测。
  - 动态标定节点延迟状态（极速、良好、缓慢、超时），支持仅导出可用节点的策略过滤。
- 🛠️ **智能聚合流水线**
  - **多源汇聚**：任意勾选/组合多个订阅源。
  - **精细过滤**：支持协议白名单、包含关键词、排除关键词、最大允许延迟过滤。
  - **智能去重**：自动根据节点 IP + 端口去重，合并冗余节点。
  - **正则改名**：自定义多重正则表达式，批量格式化节点名称与国家旗帜。
- 🔄 **多客户端智能自适应**
  - 生成单一永久聚合 Token 链接（`/sub/:token`）。
  - **自动 UA 识别**：根据请求来源（Clash.Meta、Sing-box、Surge、Loon、Shadowrocket 等）自动返回匹配格式。
  - 也可通过 URL 参数显式指定：`?target=clash|singbox|surge|loon|base64`。
- 🖥️ **现代化可视化管理面板**
  - 简洁美观的响应式 Web UI，支持实时状态概览、节点筛选、订阅源管理、操作与访问日志追踪。
- 📦 **轻量无依赖 & 极速部署**
  - 基于 Node.js + Hono + Better-SQLite3，体积小巧、内存占用极低，支持 Docker 一键秒级启动。

---

## 🎯 典型使用场景

1. **多机场整合**：将多个付费机场和自建 VPS 节点整合为一个统一的聚合链接；
2. **自动剔除失效节点**：设置最大延迟阈值或仅导出在线节点，保障客户端连接高可用；
3. **团队 / 家庭共享**：统一维护订阅，为不同成员或设备分发专属聚合规则；
4. **全平台无缝切换**：同一条聚合订阅链接，在 iOS (Surge/Loon/Shadowrocket)、Android (Clash/Sing-box)、Windows/macOS 客户端上均可直接导入。

---

## 🚀 快速启动

### 方式一：Docker 部署（推荐）

#### 1. 使用 Docker 命令
```bash
docker run -d \
  --name subhub \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  --restart unless-stopped \
  subhub:latest
```

#### 2. 使用 Docker Compose
在项目目录下执行：
```bash
docker compose up -d
```

服务启动后，在浏览器访问 `http://localhost:3000` 即可进入管理界面。

---

### 方式二：本地 / 服务器直接运行

#### 前置要求
- **Node.js** >= 20.x 或 **Bun** >= 1.1.x
- **npm** / **pnpm**

#### 安装与启动
```bash
# 1. 安装依赖
npm install

# 2. 编译打包 (前端 + 后端)
npm run build

# 3. 启动生产服务
npm start
```

服务默认监听 `http://localhost:3000`。

#### 开发模式
```bash
# 启动前端开发服务器 (带热重载与 API 反向代理)
npm run dev

# 另起终端启动后端 API 服务
npm run dev:server
```

---

## ⚙️ 环境变量

| 变量名 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `PORT` | `3000` | 服务监听端口 |
| `HOST` | `0.0.0.0` | 服务监听主机地址 |
| `DATA_DIR` | `./data` | SQLite 数据库持久化存储目录 |

---

## 🔌 支持的协议与客户端格式

### 支持的节点协议
- **VLESS** (XTLS / Reality / WS / gRPC)
- **VMess** (TCP / WS / gRPC)
- **Trojan**
- **Shadowsocks (SS)**
- **Hysteria 2 (Hy2)**

### 支持的导出格式
- **Clash / Clash Meta (Mihomo)** (`target=clash`)
- **Sing-box** (`target=singbox`)
- **Surge** (`target=surge`)
- **Loon** (`target=loon`)
- **通用 Base64 / URI 列表** (`target=base64`)

---

## 🛠️ 技术栈

- **Core Engine**：TypeScript 协议解析与配置生成引擎
- **Backend**：Node.js + [Hono](https://hono.dev/) + [Better-SQLite3](https://github.com/WiseLibs/better-sqlite3) + [Drizzle ORM](https://orm.drizzle.team/)
- **Frontend**：React 18 + Vite + TailwindCSS + Lucide Icons + Recharts
- **Container**：Docker + Multi-stage Build

---

## 📄 开源许可证

本项目基于 [MIT](LICENSE) 许可证开源。
