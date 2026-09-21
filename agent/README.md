# SubHub 边缘测速探针 (SubHub Edge Probe Agent)

用于在**本地家庭宽带、软路由、NAS、个人电脑或私有服务器**等真实用户网络环境下运行。
探针内置 **Mihomo (Clash.Meta)** 代理内核，自动定期从 SubHub 云端拉取节点，发起真实的 **URL-Test (全链路 HTTP 204)** 连通性与时延测试，并将准确的节点健康度实时同步回云端。

---

## 💡 为什么选用 Mihomo 真实测速？
1. **全协议覆盖**：完美支持 **Hysteria 2、TUIC v5、VLESS Reality、Trojan gRPC、Shadowsocks** 等各类基于 TCP / UDP 的加密协议，彻底告别旧版 TCP Ping 对 UDP 节点误报超时的问题。
2. **杜绝 CDN 假活**：必须完成 TLS 握手、账户鉴权并成功访问目标站点，彻底避免 Cloudflare CDN 边缘假活、落地断连等误判。
3. **与客户端 100% 一致**：与你在手机/电脑 Clash 客户端上测试的结果完全一致。

---

## 🚀 快速启动

### 方式一：Docker 运行（最推荐，全自动集成内核）

```bash
docker run -d \
  --name subhub-probe \
  --restart unless-stopped \
  -e SUBHUB_URL="https://subhub.yourdomain.com" \
  -e AGENT_SECRET="subprobe_your_secret_here" \
  -e INTERVAL_MINUTES=15 \
  -e CONCURRENCY=20 \
  ghcr.io/angenge/subhub-probe:latest # 或自行构建镜像
```

#### 本地快速构建运行：
```bash
cd agent
docker build -t subhub-probe:latest .
docker run -d \
  --name subhub-probe \
  --restart unless-stopped \
  -e SUBHUB_URL="https://subhub.yourdomain.com" \
  -e AGENT_SECRET="subprobe_your_secret_here" \
  subhub-probe:latest
```

---

### 方式二：裸机 / 软路由 / 个人电脑直接运行

1. **准备环境**：
   * 安装 [Node.js](https://nodejs.org/) (>= 18.0.0)。
   * 下载 [Mihomo 静态二进制文件](https://github.com/MetaCubeX/mihomo/releases)，将其命名为 `mihomo`（Windows 为 `mihomo.exe`）并放置在 PATH 环境变量目录或当前运行目录下。

2. **启动探针**：
   ```bash
   SUBHUB_URL="https://subhub.yourdomain.com" AGENT_SECRET="subprobe_your_secret_here" node probe.js
   ```

---

## ⚙️ 环境变量配置

| 变量名 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `SUBHUB_URL` | *(必填)* | 你的 SubHub 访问地址（例如 `https://subhub.yourdomain.com`） |
| `AGENT_SECRET` | *(必填)* | 在 SubHub Web 面板「节点工作台 ➔ 边缘探针配置」中获取的密钥 |
| `INTERVAL_MINUTES` | `15` | 定时测速周期（分钟） |
| `CONCURRENCY` | `20` | 并发测速任务数 |
| `TIMEOUT_MS` | `5000` | 单个节点测速超时时间（毫秒） |
| `TEST_URL` | `https://cp.cloudflare.com/generate_204` | 测速基准 URL |
| `MIHOMO_PATH` | `mihomo` | 自定义 Mihomo 可执行文件路径 |
| `MIHOMO_PORT` | `9090` | Mihomo 外部控制器本地监听端口 |
