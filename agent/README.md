# SubHub 边缘测速探针 (SubHub Probe Agent)

用于在**本地家庭宽带、软路由、NAS、个人电脑或私有小主机**等真实用户网络环境下运行，自动定期对 SubHub 中的全部节点执行 TCP 握手测速，并将真实延迟结果同步至 SubHub 云端。

---

## 🚀 快速启动

### 方式一：Node.js 单文件运行（推荐）

无需安装任何第三方 npm 依赖（基于 Node.js 原生标准库）：

```bash
# 环境变量启动
SUBHUB_URL="https://subhub.hiz.one" AGENT_SECRET="subprobe_your_secret_here" node probe.js

# 或直接传参启动
node probe.js "https://subhub.hiz.one" "subprobe_your_secret_here"
```

---

### 方式二：Docker 容器运行（适合软路由 / NAS / Unraid）

```bash
# 1. 本地构建探针镜像
docker build -t subhub-probe:latest .

# 2. 启动探针容器（开机自启）
docker run -d \
  --name subhub-probe \
  --restart unless-stopped \
  -e SUBHUB_URL="https://subhub.hiz.one" \
  -e AGENT_SECRET="subprobe_your_secret_here" \
  -e INTERVAL_MINUTES=15 \
  subhub-probe:latest
```

---

## ⚙️ 环境变量配置

| 变量名 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `SUBHUB_URL` | *(必填)* | 你的 SubHub 访问地址（例如 `https://subhub.hiz.one`） |
| `AGENT_SECRET` | *(必填)* | 在 SubHub Web 面板「节点工作台 ➔ 边缘探针配置」中获取的密钥 |
| `INTERVAL_MINUTES` | `15` | 定时测速周期（分钟） |
| `CONCURRENCY` | `25` | TCP 探测并发线程数 |
| `TIMEOUT_MS` | `2500` | 单个节点 TCP 握手超时时间（毫秒） |
