# genpac-runner

一个用于生成 PAC 代理规则文件的轻量工具，带有网页管理界面。你可以配置代理、直连域名、黑名单、远程规则列表、定时生成和 Webhook 通知。

**推荐使用 Docker Compose 部署。** 镜像会自动发布到 GitHub Container Registry（GHCR）；部署设备只需拉取预构建镜像，无需克隆源码或本地构建。配置和生成记录保存在 SQLite 中，不需要手动编辑业务配置文件。

## Docker Compose 部署（推荐）

### 1. 安装 Docker

需要 Docker Engine 和 Docker Compose。

- **Windows / macOS：** 安装 [Docker Desktop](https://www.docker.com/products/docker-desktop/)。
- **Linux：** 安装 Docker Engine 和 [Docker Compose 插件](https://docs.docker.com/compose/install/linux/)。

先确认命令可用：

```bash
docker --version
docker compose version
```

新版 Compose 使用空格形式的 `docker compose`。如果你的系统只提供旧式独立命令，也可以使用 `docker-compose`。

### 2. 获取 Compose 配置

部署时不需要克隆整个源代码仓库，只需要保存一份 `docker-compose.yml`。可以从 [GitHub 项目中的 docker-compose.yml](https://github.com/geekMus/genpac-runner/blob/main/docker-compose.yml) 下载后放进部署目录。

Linux / iStoreOS 上也可以执行：

```bash
mkdir -p genpac-runner
cd genpac-runner
curl -fL https://raw.githubusercontent.com/geekMus/genpac-runner/main/docker-compose.yml -o docker-compose.yml
```

Windows PowerShell 可以使用：

```powershell
New-Item -ItemType Directory -Force genpac-runner
Set-Location genpac-runner
Invoke-WebRequest https://raw.githubusercontent.com/geekMus/genpac-runner/main/docker-compose.yml -OutFile docker-compose.yml
```

### 3. 检查部署配置

**Docker 部署不需要创建 `.env` 文件，也不需要设置业务配置环境变量。** 代理字符串、生成模式、直连列表、黑名单、远程列表、Webhook、定时任务、时区和管理密码都由后台管理页面统一配置，并保存在 `/data/genpac.db`。

- 首次启动的默认管理密码是 `password`。登录后后台会提示修改默认密码。新密码的长度和复杂度由用户自行决定，系统不强制设置规则。
- 时区默认为 `Asia/Shanghai`，可在「配置管理 → 常规设置」中通过搜索选择常见国家/地区时区，也可输入其他有效的 IANA 时区名称。
- 容器内部端口、监听地址和数据目录属于运行参数，分别固定为 `17321`、`0.0.0.0` 和 `/data`；端口映射与数据持久化挂载仍在 `docker-compose.yml` 中按需启用。

Compose 不再声明 `ADMIN_PASSWORD`、`SESSION_SECRET` 或 `TZ`。管理员密码仅由后台管理与一次性密码重置命令设置；旧版 `ADMIN_PASSWORD` 环境变量不再导入或控制管理员凭据。升级后若无法使用默认密码登录，请按下方的密码重置说明生成一次性临时密码。
### 4. 拉取镜像并启动

本项目的多架构预构建镜像发布在 GitHub Container Registry：

- **官方镜像地址：** `ghcr.io/geekmus/genpac-runner:latest`
- **支持架构：** `linux/amd64`（64 位 Intel/AMD x86）和 `linux/arm64`（64 位 ARM）；官方 Bun 镜像不提供 32 位 `386/i386` 运行时。
- **版本发布：** 使用日历版本（CalVer），版本以 `package.json` 的 `version` 为唯一依据，格式为 `YYYY.MM.DD`，例如 `2026.10.19`，同一天需要多次修订时使用 `2026.10.19-r1`、`2026.10.19-r2`。只有 `main` 分支修改 `package.json` 且版本发生有效变化时才会推送镜像；首次从旧式版本切换到日期版本时允许迁移，后续日期与同日修订序号必须递增。成功发布后更新版本标签和 `latest`。
- **标准构建配置：** Dockerfile 使用官方 `oven/bun:1-alpine` 基础镜像、Bun 默认 npm registry 和 Alpine 官方软件源，不依赖地区专用镜像。

确认当前目录中有 `docker-compose.yml`，按需在后台修改管理员密码，并自行决定是否启用端口映射和数据挂载，然后执行：

```bash
docker compose pull
docker compose up -d
```

使用旧版独立命令时，可将 `docker compose` 替换为 `docker-compose`。此处无需使用 `--build`，因为镜像已由 GitHub Actions 构建并发布，部署设备只负责拉取、创建和启动容器。

每次运行会在 GitHub Actions 的 **Summary（摘要）** 中列出项目版本、发布判断、上一版本提交、提交记录和完整差异链接。镜像包含标准 OCI 标签，例如源码仓库地址、版本和提交 SHA，便于追溯镜像对应的代码。

网页底部会显示 GitHub 项目入口和圆角版本标签。点击版本标签可在弹窗中查看当前版本和最新版本；若检测到更新，标签会变为橙色并显示 `New` 标识。程序会依次尝试从 GitHub 原始文件、jsDelivr 和 GitHub API 获取主分支中的 `package.json`；前端也会在服务端未获取到版本时尝试备用来源。若所有来源均不可达，最新版本会显示为暂时未知，不影响 PAC 和后台功能。打开 `proxy.pac` 时，可以在文件头看到当前 `genpac-runner version`，便于确认该 PAC 文件对应的程序版本。

普通代码提交和分支合并不会触发镜像工作流；只有 `main` 上的 `package.json` 变更会触发版本检查。如果只是修改了依赖或其他字段、但没有改变 `version`，工作流不会发布镜像。发布新版本时请将 `version` 更新为当天的 `YYYY.MM.DD`，同日后续修订使用递增的 `-rN` 后缀。其他分支的普通提交不会自动触发；手动运行仅验证构建，不会推送镜像。

首次发布后，需要在 GitHub 的 **Packages** 中把 `genpac-runner` 容器包的可见性设置为 **Public**，其他人才能无需登录直接拉取。GitHub 容器包首次发布时默认是 Private；发布工作流会自动将包关联到此仓库。



### 5. 打开网页

假设你已在 `docker-compose.yml` 中启用固定的 `17321:17321` 端口映射，部署设备的 IP 是 `192.168.1.20`：

- 运行概览：`http://192.168.1.20:17321/`
- 配置管理：`http://192.168.1.20:17321/admin`
- 查看 PAC 文件：`http://192.168.1.20:17321/proxy.pac`（浏览器直接显示文件内容）

将示例 IP 换成实际部署设备的地址。该访问方式只有在手动启用 Compose 中的端口映射后才可用。

### 常用命令

以下命令都要在放有 `docker-compose.yml` 的部署目录中执行：

```bash
# 查看日志
docker compose logs -f genpac

# 重启
docker compose restart

# 停止并移除容器（若未配置 /data 持久化挂载，容器内数据会随容器删除）
docker compose down

# 拉取已发布的最新镜像并更新容器
docker compose pull
docker compose up -d
```

**若启用了命名卷，不要随意执行 `docker compose down -v`**：`-v` 会同时删除 Compose 管理的数据卷，可能导致配置和生成记录丢失。使用 `./data:/data` 目录挂载时，也请勿手动删除该目录。

## 功能简介

- **自定义规则：** 配置直连域名、黑名单和默认代理；本机及私有内网地址优先直连。
- **远程规则列表：** 从 URL 获取规则，支持 GFWList（Base64）、域名型 AutoProxy / ABP 规则，以及每行一个域名的明文列表。
- **定时生成：** 使用 Cron 表达式安排自动生成；留空即关闭定时任务。
- **Webhook 通知：** 分别配置生成成功和失败时的通知渠道，支持自定义 HTTP Webhook 和钉钉机器人。
- **主题：** 网页支持自动、浅色和深色主题。

远程列表模式会从下载的规则中提取域名用于 PAC 匹配，不会保留 URL 路径、资源类型等复杂过滤条件。自定义直连和黑名单规则优先于远程列表。运行概览中的“域名路由判断”也只是根据可识别的规则摘要进行估算，不会执行 PAC 脚本或查询 DNS，因此不能代替代理客户端中的实际连接测试。

## 数据与配置

Docker 部署时，建议在 `docker-compose.yml` 中启用一种 `/data` 持久化挂载配置。选择命名卷方案时，`genpac-data` 挂载到容器的 `/data` 目录，用于保存：

- `genpac.db`：后台配置和生成记录。
- `proxy.pac`：当前生成的 PAC 文件。

容器数据路径固定为 `/data`，容器默认工作目录也设置为 `/data`，例如执行 `docker exec -it genpac-runner sh` 进入 shell 后，当前目录就是 `/data`。Dockerfile 不声明 `VOLUME`，默认 Compose 配置也不启用数据挂载；是否持久化由用户自行决定。建议按需启用一种显式挂载：使用命名卷时，执行 `docker compose down` 不会删除该数据卷；使用 `./data:/data` 目录挂载时，数据保存在项目的 `data` 目录。不配置挂载时，数据只保存在容器可写层，删除或重建容器可能导致配置和生成记录丢失。迁移或备份时请一并保存相应数据。

业务配置都在网页的「配置管理」中完成。代理、直连与黑名单规则、远程列表、定时任务、Webhook、时区以及管理密码均保存在 SQLite。时区选择器支持搜索常用国家/地区；后端也会校验输入的 IANA 时区名称。密码以带随机盐的 scrypt 哈希保存，不会以明文写入数据库。监听地址固定为 `0.0.0.0`，内部端口固定为 `17321`，数据目录固定为 `/data`；宿主机端口映射和数据挂载则直接在 `docker-compose.yml` 中按需取消注释并修改。

## 常见问题

**提示 `docker: 'compose' is not a docker command`**

说明 Docker Compose 插件未安装，或 Docker CLI 无法找到它。请按 [Docker Compose 官方安装文档](https://docs.docker.com/compose/install/) 安装后，再运行 `docker compose version` 检查。若系统已安装旧式独立命令，可尝试 `docker-compose --version` 和 `docker-compose up -d`。

**拉取镜像时提示超时或连接重置**

部署设备无需自行构建镜像。若拉取失败，先检查能否访问 `ghcr.io`，确认 GHCR 中 `genpac-runner` 容器包已设置为 Public，然后执行 `docker compose pull` 重试。

**访问不了网页**

检查容器是否启动成功、端口是否被占用，并查看 `docker compose logs -f genpac`。如果从局域网其他设备访问，请确认服务器防火墙允许访问所配置的宿主机端口。

**忘记管理密码**

在宿主机上执行下面的命令。程序会生成随机的一次性临时密码，命令输出只显示一次：

```bash
docker exec -it genpac-runner bun run /app/scripts/reset-admin-password.ts
```

使用临时密码登录后，在后台「管理密码」卡片中设置新密码。为避免临时密码长期有效，其他管理操作会在完成修改前保持锁定。重置只更新管理员凭据，不会删除代理规则、直连/黑名单、时区、Webhook 或生成记录。

**旧版环境变量密码迁移**

旧版部署若曾通过 `ADMIN_PASSWORD` 设置自定义密码：如果旧版本已经把该密码初始化并保存到数据库，升级后数据库中已有的密码会继续有效；程序不再读取该环境变量。如果是全新数据库，初始密码为 `password`。若无法登录，请使用上方的一次性密码重置命令。此后只通过后台管理页面修改密码。

**远程列表生成失败**

确认容器可以访问列表 URL，且列表内容属于上方支持的格式。当前解析器按域名提取规则，不是完整的通用 ABP 过滤引擎。

## 本机开发（可选）

如需修改源码，可先安装 [Bun](https://bun.sh/)。

在项目根目录创建仅用于本机开发的 `.env`：

```bash
bun install
cp .env.example .env
```

Windows PowerShell 可使用：

```powershell
Copy-Item .env.example .env
```

打开 `.env`，按需设置仅用于本机开发启动的 `PORT`、`HOST` 或 `DATA_DIR`，然后运行：

```bash
bun run dev
```

开发服务器默认监听后端 `17321`，前端开发页面为 `http://127.0.0.1:5173`。生产构建可运行 `bun run typecheck` 检查类型，再运行 `bun run build` 并执行 `bun start`。业务设置、时区和管理密码保存在 SQLite，不通过环境变量维护。
