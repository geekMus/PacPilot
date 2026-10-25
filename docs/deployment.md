# 部署指南

本文是 PacPilot 的部署专属文档：部署方式、**全部启动参数的详细说明**、数据持久化与备份、常用地址，以及前后端分离部署。

应用内的业务配置（生成模式、代理、规则、定时任务、Webhook、日志保留期）保存在数据库中，通过管理后台修改，参见[配置说明](configuration.md)。环境变量只控制启动行为与网络信任策略。

本页内容：[部署方式总览](#部署方式总览) · [环境参数参考](#环境参数参考) · [Docker 部署](#docker-部署) · [Docker Compose 部署](#docker-compose-部署) · [源码运行](#源码运行) · [首次启动行为](#首次启动行为) · [数据持久化与备份](#数据持久化与备份) · [常用地址](#常用地址) · [前后端分离部署](#前后端分离部署纯静态前端)

## 部署方式总览

| 方式                       | 适用场景                                   | 要点                                                     |
| -------------------------- | ------------------------------------------ | -------------------------------------------------------- |
| Docker `run`               | 单机快速部署（推荐）                       | 镜像 `ghcr.io/geekmus/pacpilot:latest`，挂载 `/data` 持久化 |
| Docker Compose             | 希望以代码形式维护部署配置                 | 仓库提供 [docker-compose.yml](../docker-compose.yml)，按需启用端口与卷 |
| 源码运行（Bun）            | 本机开发或自建环境                         | 需要 Bun >= 1.1.0；`bun install && bun run start`         |
| 前后端分离（纯静态前端）   | 前端托管在 Cloudflare Pages / Vercel 等平台 | 后端开启 `CORS_MODE=open`，前端用 Bearer 令牌访问         |

## 环境参数参考

所有参数在**进程启动时读取一次**，修改后需重启服务生效（纯前端部署中的 `config.json` 除外，见[前端参数](#前端参数configjson-与-vite_api_base_url)）。未列出的业务设置一律在管理后台配置，不存在对应的环境变量。

### 参数一览

| 变量                     | 默认值             | 作用域       | 说明                                                       |
| ------------------------ | ------------------ | ------------ | ---------------------------------------------------------- |
| `PORT`                   | `17321`            | 监听         | 服务监听端口；容器镜像按 `17321` 设计，对外换端口用端口映射实现。 |
| `HOST`                   | `0.0.0.0`          | 监听         | 服务监听地址。                                             |
| `STORAGE_DRIVER`         | `sqlite`           | 存储         | `sqlite` 持久化 / `memory` 临时演示（重启即清空）。        |
| `DATA_DIR`               | 按运行环境决定     | 存储         | 数据目录；**容器内被忽略**（固定 `/data`）。               |
| `DEFAULT_ADMIN_PASSWORD` | 空（随机生成）     | 管理员初始化 | 首次启动的初始管理员密码；至少 8 位；仅首次生效。          |
| `ADMIN_SESSION_SECRET`   | 空（随机生成）     | 管理员初始化 | 首次初始化时写入的会话签名密钥；一般无需设置。             |
| `CORS_ALLOWED_ORIGINS`   | 空                 | 跨域         | 显式信任的管理 API 跨域 Origin 白名单，逗号分隔。          |
| `CORS_MODE`              | `strict`           | 跨域         | `strict` 同源/白名单；`open` 任意来源 + Bearer 令牌鉴权。  |
| `TRUST_PROXY_HOPS`       | `1`                | 真实 IP      | 信任的反向代理跳数，`0`–`10`。                             |
| `TRUSTED_PROXY_CIDRS`    | 空                 | 真实 IP      | 反向代理所在网段白名单（逗号分隔 CIDR）。                  |
| `TRUST_CLOUDFLARE_IP`    | `0`                | 真实 IP      | 优先采用 `CF-Connecting-IP`；必须同时配置网段白名单。     |
| `PACPILOT_ENV`           | 空                 | 运行模式     | `production` / `development`，覆盖 `NODE_ENV` 的判定。     |
| `NODE_ENV`               | 空                 | 运行模式     | 常规运行模式变量；影响非容器部署的数据目录默认值。         |

### 监听地址：PORT 与 HOST

- `PORT`：1–65535 的整数，非法值**拒绝启动**。非容器运行时直接生效；容器部署时镜像按 `17321` 设计（`EXPOSE 17321`），对外更换端口推荐用端口映射（如 `-p 8080:17321`），而不是修改容器内端口。
- `HOST`：默认 `0.0.0.0`，即监听全部网卡；配合防火墙/端口映射可从局域网访问。只需本机访问时可设为 `127.0.0.1`。

### 存储与数据目录：STORAGE_DRIVER 与 DATA_DIR

`STORAGE_DRIVER` 决定持久化方式：

- `sqlite`（默认）：所有应用数据写入 SQLite 数据库文件，重启不丢。
- `memory`：全部状态（配置、凭据、工作流、监控记录、PAC 产物）只保存在进程内存，**重启后完全清空**，也不创建数据文件。仅适合临时演示。

`DATA_DIR` 的解析优先级（从高到低）：

1. **容器环境**（自动识别 `/.dockerenv`、`RUNNING_IN_DOCKER=1` 或 Kubernetes）：固定 `/data`，**忽略 `DATA_DIR`**，运行 profile 为 `docker`。
2. **显式设置 `DATA_DIR`**：使用该路径（相对路径按当前工作目录解析）。
3. **非容器生产模式**（`PACPILOT_ENV`/`NODE_ENV` 为 production）：操作系统应用数据目录：
   - Windows：`%LOCALAPPDATA%\PacPilot`
   - macOS：`~/Library/Application Support/PacPilot`
   - Linux：`$XDG_DATA_HOME/PacPilot`，未设置 XDG 时为 `~/.local/share/PacPilot`
4. **开发模式**（默认）：仓库目录下的 `./data`。

数据目录中包含哪些文件参见[配置说明](configuration.md#数据文件与数据库)。开发模式会自动加载项目根目录的 `.env`（可从 [.env.example](../.env.example) 复制）；**Docker 容器不会读取挂载目录里的 `.env`**，请用 `-e` 或 Compose `environment` 注入。

### 管理员初始化：DEFAULT_ADMIN_PASSWORD 与 ADMIN_SESSION_SECRET

- `DEFAULT_ADMIN_PASSWORD`：仅在数据库**尚无管理员凭据的首次启动**时生效；trim 后少于 8 位会**拒绝启动**。已有凭据后修改该变量并重启不会重置密码（重置方法见[管理员密码重置](configuration.md#管理员密码重置)）。设置了该变量时，启动日志只提示已初始化、不打印密码。
- `ADMIN_SESSION_SECRET`：首次创建管理员凭据时写入数据库的会话签名密钥；未设置则随机生成。密钥此后持久化在数据库中，重启不受该变量影响。一般无需设置；修改管理员密码会轮换该密钥并使所有已发放的会话/令牌立即失效。

### 跨域来源：CORS_ALLOWED_ORIGINS 与 CORS_MODE

默认（`strict`）模式下，管理 API 只接受以下浏览器来源，其余一律拒绝：

1. **同源**请求（前端与后端同一地址）；
2. `CORS_ALLOWED_ORIGINS` 中**显式列出**的来源，如：

   ```text
   CORS_ALLOWED_ORIGINS=https://admin.example.com,https://ops.example.com
   ```

3. **本机网卡来源**：服务会动态识别当前网卡 IP，信任「本机 IP + 服务端口」与「本机 IP + Vite 开发端口 5173」的来源；因此本机开发与局域网 IP 访问通常**不需要**配置任何 CORS 参数。为避免信任同一主机上其他端口的服务，其他端口仍需显式列出。

请只添加自己控制的可信来源，不要使用通配符；管理写请求会校验 Origin，跨域凭据请求可能携带管理员会话 Cookie。

`CORS_MODE=open` 用于**前端独立部署在其他域名/主机**的场景（见[前后端分离部署](#前后端分离部署纯静态前端)）。开启后：

- 响应 `Access-Control-Allow-Origin: *`，不发送 `Access-Control-Allow-Credentials`；
- 不再对管理写请求做 Origin 白名单校验，改由令牌鉴权；
- `POST /api/admin/login` 返回 `{ token, expiresAt }`，不下发会话 Cookie；
- 前端将令牌放在 `Authorization: Bearer <token>` 请求头中。

> 安全提示：`open` 模式下任何网页都能向该服务发起请求，务必使用强管理员密码并仅通过 HTTPS 暴露服务。

### 真实客户端 IP：TRUST_PROXY_HOPS、TRUSTED_PROXY_CIDRS、TRUST_CLOUDFLARE_IP

限流与访问日志依赖真实来源 IP。三个参数配合工作：

- `TRUST_PROXY_HOPS`（默认 `1`，取值 0–10 整数）：信任的反向代理跳数；`0` 表示完全忽略 `X-Forwarded-For` 等转发头，直接使用 TCP 对端地址。链路为 `Cloudflare → cloudflared → Nginx → 应用` 时按实际层数设为 `2` 或更多。
- `TRUSTED_PROXY_CIDRS`（逗号分隔的合法 CIDR）：代理所在网段白名单。**配置后只有对端 IP 落在网段内才读取转发头**，其他来源的 `X-Forwarded-For` / `CF-Connecting-IP` 一律忽略，防止公网客户端伪造。Docker 默认 bridge 通常是 `172.17.0.0/16`，Compose 自定义网络可能是 `172.18.0.0/16` 等，用 `docker network inspect <网络名>` 确认。
- `TRUST_CLOUDFLARE_IP`（`1`/`true`/`yes`/`on` 开启）：优先使用 Cloudflare 写入的 `CF-Connecting-IP`。**必须同时设置 `TRUSTED_PROXY_CIDRS`，否则启动即报错**——这是刻意设计，避免未界定信任边界就采信客户端可控的头。

通过 Cloudflare Tunnel 暴露的典型配置：

```text
TRUST_PROXY_HOPS=1
TRUST_CLOUDFLARE_IP=1
TRUSTED_PROXY_CIDRS=172.17.0.0/16
```

### 运行模式：PACPILOT_ENV 与 NODE_ENV

`PACPILOT_ENV`（`production`/`prod`、`development`/`dev`）优先于 `NODE_ENV` 判定运行模式。运行模式只影响两件事：非容器部署时数据目录的默认值（见上文优先级第 3、4 条），以及 `/api/meta` 暴露的 profile 标识。容器内自动为 `docker` 模式。日常部署**无需设置**这两个变量。

### 前端参数：config.json 与 VITE_API_BASE_URL

前端访问后端 API 的地址只在前端独立部署时需要配置，两种方式任选：

- **运行时**（推荐）：在构建产物目录放置 `config.json`（与 `index.html` 同目录）：

  ```json
  { "apiBaseUrl": "https://api.example.com" }
  ```

  修改后刷新页面即生效，无需重新构建。空字符串或省略表示同源。
- **构建期**：`VITE_API_BASE_URL=https://api.example.com bun run build:client`，优先级高于 `config.json`。

### 参数校验：哪些配置错误会拒绝启动

以下非法配置会让服务启动失败并输出明确错误（fail-fast，避免带隐患运行）：

| 变量                     | 非法情形                                   |
| ------------------------ | ------------------------------------------ |
| `PORT`                   | 非整数、≤ 0 或 > 65535                    |
| `STORAGE_DRIVER`         | 不是 `sqlite` / `memory`                   |
| `CORS_MODE`              | 不是 `strict` / `open`                     |
| `TRUST_PROXY_HOPS`       | 非 0–10 的整数                             |
| `TRUSTED_PROXY_CIDRS`    | 任一条目不是合法 CIDR                      |
| `TRUST_CLOUDFLARE_IP`    | 已开启但未配置 `TRUSTED_PROXY_CIDRS`       |
| `DEFAULT_ADMIN_PASSWORD` | 非空且 trim 后少于 8 位                    |

## Docker 部署

需要 Docker Engine。镜像地址：

```text
ghcr.io/geekmus/pacpilot:latest
```

创建并启动容器：

```bash
docker run -d \
  --name pacpilot \
  --restart unless-stopped \
  -p 17321:17321 \
  -v pacpilot-data:/data \
  ghcr.io/geekmus/pacpilot:latest
```

需要注入参数时用 `-e`，例如指定初始管理员密码并放到代理后：

```bash
docker run -d \
  --name pacpilot \
  --restart unless-stopped \
  -p 17321:17321 \
  -v pacpilot-data:/data \
  -e DEFAULT_ADMIN_PASSWORD='your-strong-password' \
  -e TRUST_PROXY_HOPS=2 \
  -e TRUSTED_PROXY_CIDRS=172.17.0.0/16 \
  ghcr.io/geekmus/pacpilot:latest
```

行为要点：

- 容器内服务端口固定为 `17321`；宿主机端口冲突时改为 `-p 8080:17321` 并用映射端口访问。
- `pacpilot-data` 命名卷持久化数据库、配置、工作流与监控记录、远程规则快照。
- 首次启动：未设置 `DEFAULT_ADMIN_PASSWORD` 时生成随机管理员密码并**在日志中打印一次**（`docker logs pacpilot`）；设置了则使用该密码且不打印。
- 服务默认绑定 `0.0.0.0`，浏览器通过服务自身地址访问属于同源请求，无需任何 CORS 配置。

## Docker Compose 部署

仓库提供 [docker-compose.yml](../docker-compose.yml)：默认使用预构建镜像与 bridge 网络，但**不发布端口、不挂载数据卷**，请按需启用后启动：

```bash
docker compose pull
docker compose up -d
docker compose logs -f pacpilot
```

端口映射：

```yaml
ports:
  - "17321:17321"
```

持久化挂载任选一种，不要同时使用：

```yaml
# 方式 A：Docker 命名卷（需在顶层声明 volumes: pacpilot-data:）
volumes:
  - pacpilot-data:/data
```

```yaml
# 方式 B：挂载到项目目录（确保读写权限）
volumes:
  - ./data:/data
```

注入环境参数使用 `environment:`，变量与语义见[环境参数参考](#环境参数参考)。

## 源码运行

需要 [Bun](https://bun.sh/) >= 1.1.0：

```bash
bun install
bun run build      # 构建前端产物
bun run start      # 生产模式启动
```

本机开发（Vite 热更新 + 自动加载根目录 `.env`）：

```bash
bun run dev
```

开发环境的端口、数据目录与参数细节见[开发指南](development.md)。

## 首次启动行为

使用全新数据库的**第一次启动**只做初始化：创建管理员凭据（随机密码打印在日志中，或使用 `DEFAULT_ADMIN_PASSWORD`），**不会自动生成 PAC**。生成 PAC 的途径：

- 登录后台修改任一影响 PAC 的设置（模式、代理、规则、远程地址、压缩开关）——修改即时保存并自动触发生成；
- 在后台总览点击「立即生成」；
- 之后每次服务重启也会自动执行启动工作流刷新 PAC。

远程规则模式下，首次生成需要服务能访问远程列表；拉取失败时 `/pac` 返回全量直连脚本并在日志告警，见[故障排查](troubleshooting.md)。

## 数据持久化与备份

- **`STORAGE_DRIVER=sqlite`（默认）**：数据目录中保存 `database.db`（配置、管理员凭据、工作流记录、请求监控、远程规则快照）与 `pac.rule-source.json`（远程规则快照）。文件内容详见[配置说明](configuration.md#数据文件与数据库)。
- **`STORAGE_DRIVER=memory`**：无任何落盘文件，重启即回到初始状态。
- **备份**：停止容器（或确保低负载）后复制整个数据目录即可，例如：

  ```bash
  docker run --rm -v pacpilot-data:/data -v "$PWD":/backup alpine \
    tar czf /backup/pacpilot-data.tar.gz -C /data .
  ```

- **恢复**：解包回数据目录后重启服务。数据库通过 `PRAGMA user_version` 做 schema 增量迁移，旧版本数据目录可直接被新版本启动。
- **重要**：需要保留数据时不要删除数据卷（`docker volume rm pacpilot-data`），升级前先备份。

## 常用地址

将 `<服务器地址>:17321` 替换为实际访问地址；修改了宿主机端口时使用映射端口。

| 页面或资源     | 地址                                              |
| -------------- | ------------------------------------------------- |
| 公共状态页     | `http://<服务器地址>:17321/`                      |
| PAC 源码       | `http://<服务器地址>:17321/pac`                   |
| 下载 PAC       | `http://<服务器地址>:17321/pac?download=1`        |
| 后台总览       | `http://<服务器地址>:17321/admin/dashboard`       |
| 生成配置       | `http://<服务器地址>:17321/admin/settings`        |
| 网络监控       | `http://<服务器地址>:17321/admin/monitor`         |
| 工作流与历史   | `http://<服务器地址>:17321/admin/workflows`       |
| 系统设置与维护 | `http://<服务器地址>:17321/admin/system-settings` |

公共状态页与 PAC 地址无需管理员登录；管理后台及管理 API 需要管理员会话。

## 前后端分离部署（纯静态前端）

前端是纯静态站点，可托管在 Cloudflare Pages、Vercel、Netlify 或任意静态托管；后端继续运行在另一台主机（含 Docker、Cloudflare Tunnel 暴露的实例）。

### 1. 后端准备

```text
CORS_MODE=open
TRUST_PROXY_HOPS=1        # Cloudflare Tunnel 直连 1 跳；前面还有 Nginx 时为 2
TRUST_CLOUDFLARE_IP=1     # 通过 Cloudflare / cloudflared 暴露时开启
TRUSTED_PROXY_CIDRS=172.17.0.0/16
```

`CORS_MODE=open` 的鉴权行为变化见[跨域来源参数](#环境参数参考)。后端必须通过 **HTTPS** 对外提供服务：浏览器会拦截 `https` 页面请求 `http` 接口（混合内容）。

### 2. 前端构建与配置

```bash
bun run build:client
```

产物在 `dist/client`。按[前端参数](#前端参数configjson-与-vite_api_base_url)配置 API 地址后部署。

### 3. 平台注意事项

| 平台             | 方式                                                         |
| ---------------- | ------------------------------------------------------------ |
| Cloudflare Pages | 直接上传 `dist/client`；`config.json` 与 `index.html` 同目录 |
| Vercel           | 静态站点，Output Directory 指向 `dist/client`                |
| Netlify          | Publish directory 指向 `dist/client`                         |
| 对象存储 / Nginx | 需要为 SPA 回退到 `index.html`                               |

### 4. 校验清单

1. 打开前端站点，进入 `/admin/login` 并登录。
2. 浏览器开发者工具确认请求发往 `apiBaseUrl`，且请求头带 `Authorization: Bearer …`。
3. 修改任一设置后刷新页面，数据仍然存在。
4. 在另一台设备上修改管理员密码后，本机下一次操作应提示重新登录（令牌随 `sessionSecret` 轮换失效）。
5. 在后端日志中确认记录的是真实客户端 IP，而不是 `172.x` 网段地址。
