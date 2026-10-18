# genpac-runner

基于 **Bun** 的自动 PAC 生成工具。

- **开发 / 生产** 在 Windows、Linux、macOS、Docker 下均可运行
- 业务配置经 **Vue 3 后台** 写入 **SQLite**（`bun:sqlite`）
- 启动只需少量环境变量；其余（模式、代理、列表、Webhook、Cron）在面板中配置

---

## 目录结构

```
server/          # Bun 直接运行的 TypeScript 后端
client/          # Vue 3 + Vite 前端
scripts/         # dev / 生产启动脚本（跨平台设置环境）
dist/client/     # 前端构建产物（生产由后端托管）
```

---

## 数据目录（生成文件放在哪里）

服务会在数据目录中写入：

| 文件 | 说明 |
|------|------|
| `genpac.db` | SQLite：后台配置与生成日志 |
| `proxy.pac` | 当前生成的 PAC 文件 |

### 解析优先级（从高到低）

1. **环境变量 `DATA_DIR`**（显式指定时始终优先，适合任意自定义路径）
2. **Docker / 容器** → `/data`（请挂载卷持久化）
3. **生产环境** → 见下表「各系统默认路径」
4. **开发环境** → 当前工作目录下的 `./data`

如何判定环境：

| 场景 | 判定方式 | 典型启动命令 |
|------|----------|----------------|
| 开发 | `NODE_ENV` / `GENPAC_ENV` 为 development，或使用 `bun run dev` | `bun run dev` / `bun run dev:server` |
| 生产 | `NODE_ENV=production`（`bun start` 会自动设置） | `bun start` |
| Docker | 存在 `/.dockerenv` 或 `RUNNING_IN_DOCKER=1` | `docker compose up` |

### 各系统默认路径（未设置 `DATA_DIR` 时）

| 环境 | 默认数据目录 |
|------|----------------|
| **开发（任意 OS）** | `<项目当前工作目录>/data` |
| **生产 · Windows** | `%LOCALAPPDATA%\genpac-runner`（例如 `C:\Users\<用户>\AppData\Local\genpac-runner`） |
| **生产 · macOS** | `~/Library/Application Support/genpac-runner` |
| **生产 · Linux** | `$XDG_DATA_HOME/genpac-runner`，若未设置 XDG 则为 `~/.local/share/genpac-runner` |
| **Docker** | `/data`（compose 中已配置命名卷） |

启动日志会打印实际路径，例如：

```text
[boot] profile=development
[boot] dataDir=/path/to/genpac-runner/data
```

或生产 Windows：

```text
[boot] profile=production
[boot] dataDir=C:\Users\...\AppData\Local\genpac-runner
```

### 自定义路径示例

```env
# .env 或系统环境变量
DATA_DIR=D:\pac-data
# Linux 服务也可：
# DATA_DIR=/var/lib/genpac-runner
```

---

## 快速开始

### 1. 安装依赖

```bash
bun install
cp .env.example .env
# 编辑 .env：至少设置 ADMIN_PASSWORD；端口冲突时改 PORT
```

### 2. 开发

```bash
bun run dev          # 后端热重载 + 前端 Vite
# 或仅后端：
bun run dev:server
```

- 数据默认写在 **项目下的 `data/`**
- 前端开发服务器：`http://127.0.0.1:5173`（API 代理到后端）
- 后端默认：`http://127.0.0.1:17321`

### 3. 生产（本机直接跑）

```bash
bun run build        # 构建 Vue 到 dist/client
bun start            # NODE_ENV=production，数据目录按操作系统选择
```

### 4. Docker

```bash
docker compose up -d --build
```

- 宿主机访问：`http://主机:17321/proxy.pac`、`/status`、`/admin`
- 容器内数据目录：`/data`（卷 `genpac-data`）

---

## 环境变量（仅启动级）

| 变量 | 说明 |
|------|------|
| `DATA_DIR` | 数据目录（可选；不设则按上文规则自动选择） |
| `PORT` | HTTP 端口，默认 `17321` |
| `HOST` | 监听地址，默认 `0.0.0.0` |
| `ADMIN_PASSWORD` | 设置后启用 `/admin`；不设置则后台关闭 |
| `SESSION_SECRET` | Cookie 签名（可选） |
| `TZ` | 时区，默认 `Asia/Shanghai` |
| `NODE_ENV` / `GENPAC_ENV` | `development` 或 `production`（一般由 `dev` / `start` 脚本设置） |
| `RUNNING_IN_DOCKER` | 镜像内已设为 `1`，用于识别容器 |

业务参数（生成模式、代理、直连/黑名单、Cron、Webhook）**不要**写在环境变量里，请在后台面板配置。

---

## 路由

| 路径 | 说明 |
|------|------|
| `/proxy.pac` | 当前 PAC |
| `/status` | 规则状态页（只读实际 PAC） |
| `/admin` | 后台管理（需 `ADMIN_PASSWORD`） |
| `/api/*` | JSON API |

主题：页面右上角可切换 **自动 / 浅色 / 深色**（默认跟随系统）。

---

## 启动模式（后台可切换）

1. **自定义规则（custom）**  
   在后台维护直连列表、黑名单；未命中则走你配置的 `pacProxy`。内网始终直连。

2. **远程规则列表（remote）**  
   在后台填写**任意**规则列表 URL，由 **Bun 内置引擎**下载并生成 PAC。  
   支持内容格式：
   - 标准 **GFWList**（Base64）
   - **AutoProxy / ABP** 风格规则（`||domain`、`@@` 例外）
   - **明文域名列表**（每行一个域名，`#` 注释）

   命中列表的域名走代理，其余直连。自定义直连/黑名单在此模式下不写入 PAC。

---

## 常见问题

### 端口被占用

```text
Failed to start server. Is port 17321 in use?
```

- Windows：`netstat -ano | findstr :17321`，再 `taskkill /PID <pid> /F`
- 或在 `.env` 中设置 `PORT=17322`

### 远程列表模式生成失败

内置引擎会请求你在后台配置的列表 URL。请确认：

- 本机/容器能访问该 URL
- 内容为 GFWList、ABP 规则或每行一个域名的明文列表

自定义规则模式不下载远程列表。

### 后台打不开

确认已设置 `ADMIN_PASSWORD`（`.env` 或系统环境变量），然后看启动日志是否为 `admin=enabled`。

### 生产环境找不到生成的文件

先看启动日志里的 `dataDir=`。未设置 `DATA_DIR` 时，生产文件在系统标准目录（见上文表格），**不在**项目文件夹里。

---

## License

MIT
