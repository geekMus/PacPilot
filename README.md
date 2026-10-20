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

- 首次启动的默认管理密码是 `password`。登录后必须先修改默认密码，才能使用配置管理以外的后台功能。新密码的长度和复杂度由用户自行决定，系统不强制设置规则。
- 时区默认使用中国标准时间（`Asia/Shanghai`，UTC+08:00）。可在「后台管理 → 配置设置 → 常规设置」中搜索常用地区或 IANA 时区代码，也可输入其他有效的 IANA 时区标识。
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

公共状态页在标题区域下方突出显示 PAC 文件操作区，提供「查看 PAC」「下载 PAC」和「刷新状态」；页面底部不再重复放置 PAC 文件入口。后台管理总览、配置设置和管理控制台侧边栏均不再提供单独的 PAC 文件入口，需要查看或下载时请前往公共状态页。

网页底部会显示 GitHub 项目入口和圆角版本标签。点击版本标签可打开“项目与版本”弹窗；若检测到更新，标签会变为橙色并显示 `New` 标识。最新版本信息由用户浏览器直接请求 `https://github.mus.pp.ua/https://raw.githubusercontent.com/geekMus/genpac-runner/refs/heads/main/package.json` 获取，不再由部署该服务的主机代为请求。每次进入包含页脚的页面时会请求一次；主动点击版本标签打开弹窗时会再请求一次；在弹窗中手动点击“最新版本”时也会重新请求。每次请求使用唯一查询参数并禁用浏览器缓存，降低代理或 CDN 返回旧内容的概率。若代理地址不可达、浏览器跨域请求被拒绝或返回的版本号无效，最新版本会显示为暂时未知，不影响 PAC 和后台功能。打开 `proxy.pac` 时，可以在文件头看到中文版本标记与本次生成时间，便于确认该 PAC 文件对应的程序版本和生成时刻。PAC 生成前会校验代理字符串的 PAC 指令、主机地址与端口，支持 `PROXY`、`HTTP`、`HTTPS`、`SOCKS`、`SOCKS4`、`SOCKS5` 和 `DIRECT`。生成文件中的说明注释尽量使用中文；协议规定的函数名、变量名和代理指令保留标准写法。启用 PAC 压缩时，为减小体积会移除正文注释，但文件头仍保留中文版本标记与生成时间。

未涉及 `package.json` 的普通提交或合并不会自动触发镜像工作流；`main` 分支上的 `package.json` 发生变更时会运行版本检查。只有版本号发生符合规则的有效变化才会推送镜像；如果只是修改依赖或其他字段、但没有改变 `version`，仍会执行构建验证，但不会发布镜像。发布新版本时请将 `version` 更新为当天的 `YYYY.MM.DD`，同日后续修订使用递增的 `-rN` 后缀。其他分支的普通提交不会自动触发；手动运行仅验证构建，不会推送镜像。

首次发布后，需要在 GitHub 的 **Packages** 中把 `genpac-runner` 容器包的可见性设置为 **Public**，其他人才能无需登录直接拉取。GitHub 容器包首次发布时默认是 Private；发布工作流会自动将包关联到此仓库。

### 5. 打开网页

假设你已在 `docker-compose.yml` 中启用固定的 `17321:17321` 端口映射，部署设备的 IP 是 `192.168.1.20`：

- 公共状态页：`http://192.168.1.20:17321/`（无需管理员登录；页面顶部提供「查看 PAC」「下载 PAC」和「刷新状态」入口）
- 后台管理 / 总览：`http://192.168.1.20:17321/admin/dashboard`（需要管理员登录，默认进入总览，汇总 PAC 状态、配置摘要、生成记录和访问趋势）
- 配置设置：`http://192.168.1.20:17321/admin/settings`（需要管理员登录）
- 网络监控：`http://192.168.1.20:17321/admin/monitor`（需要管理员登录）

PAC 文件的查看和下载入口集中在公共状态页。管理总览与配置设置不再提供单独的「查看 PAC」入口；需要获取文件时，请从公共状态页顶部的 PAC 操作区域进入。

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

- **自定义规则：** 配置直连域名、黑名单和默认代理；localhost、无点号主机名、IPv4 回环地址和 RFC 1918 私网地址优先直连。
- **远程规则列表：** 从 URL 获取规则，支持 GFWList（Base64）、域名型 AutoProxy / ABP 规则，以及每行一个域名的明文列表。
- **定时生成：** 使用 Cron 表达式安排自动生成；留空即关闭定时任务。
- **Webhook 通知：** 分别配置生成成功和失败时的通知渠道，支持自定义 HTTP Webhook 和钉钉机器人。
- **网络监控（试用）：** 管理后台记录网页、PAC 和 API 请求；趋势图基于 ECharts（请求量为柱状图，响应耗时为折线图），展示活动 HTTP 请求、应用端 TCP 连接、请求量、来源地址、状态码、响应耗时与客户端（User-Agent）等；点击访问记录行可查看请求头、查询参数等完整详情并复制。支持手动检测当前 PAC 代理节点的 TCP 连接、代理协议握手和目标 HTTPS 请求，并保留有限期限的检测历史。
- **主题：** 网页支持自动、浅色和深色主题。

远程列表模式会从下载的规则中提取域名用于 PAC 匹配，不会保留 URL 路径、资源类型等复杂过滤条件。自定义直连和黑名单规则优先于远程列表。公共状态页中的“域名路由判断”也只是根据可识别的规则摘要进行估算，不会执行 PAC 脚本或查询 DNS，因此不能代替代理客户端中的实际连接测试。

网络监控当前仅统计 genpac-runner 自身收到的请求，不代表浏览器通过代理访问了哪些网站，也不等于代理服务端的真实连接数。来源地址记录应用 TCP 连接的对端，并在界面中完整展示（不做脱敏）。访问明细会保存查询参数与完整请求头（含 Cookie、Authorization 等），不保存请求正文；请求路径最多约 1,024 个字符，User-Agent 最多约 512 个字符，请求头 JSON 有软性长度上限。访问记录最多保留 7 天且上限为 5,000 条。代理测试由 genpac-runner 所在的主机或容器发起，对可识别的 PAC 代理条目执行协议握手，并默认通过代理请求 `https://www.google.com/generate_204`（可在监控页修改）；它不能验证客户端电脑上的回环代理是否可用，也不会自动切换或修改 PAC 规则。

## 数据与配置

Docker 部署时，建议在 `docker-compose.yml` 中启用一种 `/data` 持久化挂载配置。选择命名卷方案时，`genpac-data` 挂载到容器的 `/data` 目录，用于保存：

- `genpac.db`：后台配置和生成记录。
- `proxy.pac`：当前生成的 PAC 文件。

容器数据路径固定为 `/data`，容器默认工作目录也设置为 `/data`，例如执行 `docker exec -it genpac-runner sh` 进入 shell 后，当前目录就是 `/data`。Dockerfile 不声明 `VOLUME`，默认 Compose 配置也不启用数据挂载；是否持久化由用户自行决定。建议按需启用一种显式挂载：使用命名卷时，执行 `docker compose down` 不会删除该数据卷；使用 `./data:/data` 目录挂载时，数据保存在项目的 `data` 目录。不配置挂载时，数据只保存在容器可写层，删除或重建容器可能导致配置和生成记录丢失。迁移或备份时请一并保存相应数据。

业务配置都在「后台管理 → 配置设置」中完成。代理、直连与黑名单规则、远程列表、定时任务、Webhook、时区以及管理密码均保存在 SQLite。时区选择器支持按地区名称或 IANA 时区代码搜索；后端会校验输入的时区标识。所有计划任务、运行记录和 Webhook 通知均使用所选时区显示时间。密码以带随机盐的 scrypt 哈希保存，不会以明文写入数据库。监听地址固定为 `0.0.0.0`，内部端口固定为 `17321`，数据目录固定为 `/data`；宿主机端口映射和数据挂载则直接在 `docker-compose.yml` 中按需取消注释并修改。

## 常见问题

**提示 `docker: 'compose' is not a docker command`**

说明 Docker Compose 插件未安装，或 Docker CLI 无法找到它。请按 [Docker Compose 官方安装文档](https://docs.docker.com/compose/install/) 安装后，再运行 `docker compose version` 检查。若系统已安装旧式独立命令，可尝试 `docker-compose --version` 和 `docker-compose up -d`。

**拉取镜像时提示超时或连接重置**

部署设备无需自行构建镜像。若拉取失败，先检查能否访问 `ghcr.io`，确认 GHCR 中 `genpac-runner` 容器包已设置为 Public，然后执行 `docker compose pull` 重试。

**访问不了网页**

检查容器是否启动成功、端口是否被占用，并查看 `docker compose logs -f genpac`。如果从局域网其他设备访问，请确认服务器防火墙允许访问所配置的宿主机端口。

**忘记管理密码**

重置脚本适用于 Docker、本机开发，以及 Linux、Unix、macOS、Windows 等非容器部署。项目使用 Bun 运行时，所以下列命令需要在项目根目录执行，并且需要对实际数据库文件有读写权限。脚本会生成随机的一次性临时密码，命令输出只显示一次；请使用临时密码登录后，在后台「管理密码」卡片中立即设置新密码。完成修改前，其他管理操作会被锁定。

- **Docker 容器：** 在宿主机执行下面的命令；脚本会使用容器内的 `/data` 目录：

  ```bash
  docker exec -it genpac-runner bun run /app/scripts/reset-admin-password.ts
  ```

- **本机开发：** 读取项目根目录的开发环境 `.env`；未另行设置时，数据库位于项目的 `./data/genpac.db`：

  ```bash
  bun run reset:admin-password:development
  ```

- **Linux / Unix / macOS / Windows 的非容器生产部署：** 使用与服务相同的生产数据目录规则（优先采用系统环境中的 `DATA_DIR`）。默认目录为 Linux/Unix 的 `$XDG_DATA_HOME/genpac-runner` 或 `~/.local/share/genpac-runner`、macOS 的 `~/Library/Application Support/genpac-runner`、Windows 的 `%LOCALAPPDATA%\genpac-runner`：

  ```bash
  bun run reset:admin-password:production
  ```

- **自定义数据库目录：** 当服务由 systemd、Windows 服务管理器等启动，且其环境变量或工作目录与当前终端不同时，可显式指定服务实际使用的数据目录（目录内必须已有 `genpac.db`）：

  ```bash
  bun run scripts/reset-admin-password.ts --production --data-dir "/absolute/path/to/data"
  ```

  Windows PowerShell 示例：`bun run scripts/reset-admin-password.ts --production --data-dir "C:\genpac\data"`。若服务通过环境变量设置了 `DATA_DIR`，请确保重置命令继承同一个值，或通过 `--data-dir` 指定同一路径。

脚本会打印实际使用的数据目录和数据库文件。若找不到已有的 `genpac.db`，它会停止并报错，不会新建空数据库，以免把密码重置到了错误的位置。重置只更新管理员凭据，不会删除代理规则、直连/黑名单、时区、Webhook 或生成记录。

**旧版环境变量密码迁移**

旧版部署若曾通过 `ADMIN_PASSWORD` 设置自定义密码：如果旧版本已经把该密码初始化并保存到数据库，升级后数据库中已有的密码会继续有效；程序不再读取该环境变量。如果是全新数据库，初始密码为 `password`。若无法登录，请使用上方与当前部署方式对应的一次性密码重置命令。此后只通过后台管理页面修改密码。

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

开发服务器默认监听后端 `17321`，前端开发页面为 `http://127.0.0.1:5173`。运行以下命令可一次检查服务端与客户端类型、执行客户端生产构建、校验两种语言的翻译键和占位符，并在隔离的内存数据库和临时目录中验证 PAC 工作流与管理 API：

```bash
bun run check
```

该命令会依次执行 `bun run typecheck`、`bun run build` 和 `bun run check:runtime`。单独运行类型检查、生产构建或运行时检查时，也可分别使用对应子命令。格式化源码（Prettier）或仅检查格式可使用：

```bash
# 格式化源码（Prettier）
bun run format
# 仅检查格式是否符合规范
bun run format:check
```

部署生产构建可执行 `bun start`。业务设置、时区和管理密码保存在 SQLite，不通过环境变量维护。
