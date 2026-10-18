# genpac-runner

一个用于生成 PAC 代理规则文件的轻量工具，带有网页管理界面。你可以配置代理、直连域名、黑名单、远程规则列表、定时生成和 Webhook 通知。

**推荐使用 Docker Compose 部署。** 配置和生成记录保存在 SQLite 中，不需要手动编辑业务配置文件。

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

### 2. 下载项目

安装了 Git 的设备执行：

```bash
git clone --branch refactor/modular-sqlite-admin --single-branch https://github.com/geekMus/genpac-runner.git
cd genpac-runner
```

当前克隆命令指定了项目分支，以确保获取这里记录的版本。也可以在 GitHub 项目页选择 **Code → Download ZIP**，解压后进入包含 `docker-compose.yml` 的项目目录。

### 3. 设置环境变量

**Docker 部署不需要创建或复制 `.env` 文件。** 容器使用 Docker Compose 注入的环境变量。至少需要设置 `ADMIN_PASSWORD`。

Linux / macOS / Git Bash：

```bash
export ADMIN_PASSWORD='替换成你自己的强密码'
export COMPOSE_DISABLE_ENV_FILE=1

# 以下配置可选；不设置时使用默认值
export TZ=Asia/Shanghai
# export SESSION_SECRET='建议使用独立的长随机字符串'
```

Windows PowerShell：

```powershell
$env:ADMIN_PASSWORD = "替换成你自己的强密码"
$env:COMPOSE_DISABLE_ENV_FILE = "1"

# 以下配置可选；不设置时使用默认值
$env:TZ = "Asia/Shanghai"
# $env:SESSION_SECRET = "建议使用独立的长随机字符串"
```

请把密码替换成自己的强密码。设置 `COMPOSE_DISABLE_ENV_FILE=1` 是为了让 Docker Compose 不读取项目目录中的默认 `.env` 文件——这样即使同一个目录里存在供本机开发使用的 `.env`，Docker 部署也只会采用当前终端或部署平台注入的环境变量。详情见 [Docker Compose 官方说明](https://docs.docker.com/compose/how-tos/environment-variables/envvars/)。

这些变量在当前终端会话中有效。后续更新或执行其他 Compose 命令时，请继续使用该会话，或在部署平台 / 服务管理器中配置同样的环境变量。端口和数据挂载不通过环境变量控制，而是在 `docker-compose.yml` 里用注释预先标出，按需取消注释和修改。

### 4. 构建并启动

本项目固定使用 **DaoCloud 国内镜像代理**拉取 Bun 基础镜像：`m.daocloud.io/docker.io/oven/bun:1-alpine`。该地址按 DaoCloud 公共镜像项目推荐的“增加前缀”方式配置（[官方说明](https://github.com/DaoCloud/public-image-mirror)）。Dockerfile 的构建阶段和运行阶段均写死该地址，不提供环境变量覆盖方式。

如果该镜像代理也无法连接，可在 `Dockerfile` 中将两处 `FROM m.daocloud.io/docker.io/oven/bun:1-alpine` 手动改成你确认可用的镜像地址，再重新构建。基础镜像成功下载后，构建过程中安装系统依赖和 Bun 包等步骤仍需要网络访问。

确认当前目录是项目根目录（里面有 `docker-compose.yml`），并且已设置上述环境变量、完成所需的 Compose 配置，然后执行：

```bash
docker compose up -d --build
```

如果系统使用旧式独立命令，则执行：

```bash
docker-compose up -d --build
```

这条命令会根据项目中的 `Dockerfile` 构建镜像，并在后台启动容器。不需要先执行 `docker pull genpac-runner`，本项目会从源码构建自己的应用镜像。

查看运行状态和日志：

```bash
docker compose ps
docker compose logs -f genpac
```

### 5. 打开网页

假设你已在 `docker-compose.yml` 中启用固定的 `17321:17321` 端口映射，部署设备的 IP 是 `192.168.1.20`：

- 运行概览：`http://192.168.1.20:17321/`
- 配置管理：`http://192.168.1.20:17321/admin`
- PAC 文件：`http://192.168.1.20:17321/proxy.pac`

将示例 IP 换成实际部署设备的地址。容器内部监听端口固定为 `17321`。

### 常用命令

以下命令都要在项目目录中、且环境变量已设置的终端会话里执行：

```bash
# 查看日志
docker compose logs -f genpac

# 重启
docker compose restart

# 停止并移除容器（配置数据仍会保留）
docker compose down

# 拉取最新代码并重新构建、启动
git pull
docker compose up -d --build
```

**若启用了命名卷，不要随意执行 `docker compose down -v`**：`-v` 会同时删除 Compose 管理的数据卷，可能导致配置和生成记录丢失。使用 `./data:/data` 目录挂载时，也请勿手动删除该目录。

## 功能简介

- **自定义规则：** 配置直连域名、黑名单和默认代理；本机及私有内网地址优先直连。
- **远程规则列表：** 从 URL 获取规则，支持 GFWList（Base64）、域名型 AutoProxy / ABP 规则，以及每行一个域名的明文列表。
- **定时生成：** 使用 Cron 表达式安排自动生成；留空即关闭定时任务。
- **Webhook 通知：** 分别配置生成成功和失败时的通知渠道，支持自定义 HTTP Webhook 和钉钉机器人。
- **主题：** 网页支持自动、浅色和深色主题。

远程列表模式会提取规则中的域名进行 PAC 匹配，不会保留 URL 路径、资源类型等复杂过滤条件。自定义直连和黑名单规则优先于远程列表。

## 数据与配置

Docker 部署时，建议在 `docker-compose.yml` 中启用一种 `/data` 持久化挂载配置。选择命名卷方案时，`genpac-data` 挂载到容器的 `/data` 目录，用于保存：

- `genpac.db`：后台配置和生成记录。
- `proxy.pac`：当前生成的 PAC 文件。

容器数据路径固定为 `/data`，且该目录已通过 Dockerfile 的 `VOLUME` 声明。建议在 Compose 中启用一种显式挂载：使用命名卷时，执行 `docker compose down` 不会删除该数据卷；使用 `./data:/data` 目录挂载时，数据保存在项目的 `data` 目录。若不配置显式挂载，Docker 会创建匿名卷，容器重建时不一定自动复用旧卷。迁移或备份时请一并保存相应数据。

业务配置都在网页的「配置管理」中完成。启动级设置通过环境变量配置：例如 `ADMIN_PASSWORD` 是后台管理密码，`TZ` 是时区，`SESSION_SECRET` 是可选的会话签名密钥。宿主机端口映射和数据挂载则直接在 `docker-compose.yml` 中按需取消注释并修改。

## 常见问题

**提示 `docker: 'compose' is not a docker command`**

说明 Docker Compose 插件未安装，或 Docker CLI 无法找到它。请按 [Docker Compose 官方安装文档](https://docs.docker.com/compose/install/) 安装后，再运行 `docker compose version` 检查。若系统已安装旧式独立命令，可尝试 `docker-compose --version` 和 `docker-compose up -d --build`。

**拉取 Bun 基础镜像时提示 EOF、超时或连接重置**

当前项目固定使用 DaoCloud 镜像代理。可以先重试构建；如果该代理仍不可用，请按上方说明手动修改 Dockerfile 中两处 `FROM` 镜像地址。

**访问不了网页**

检查容器是否启动成功、端口是否被占用，并查看 `docker compose logs -f genpac`。如果从局域网其他设备访问，请确认服务器防火墙允许访问所配置的宿主机端口。

**后台无法登录**

确认创建容器时设置了 `ADMIN_PASSWORD`，然后在包含该环境变量的终端会话中重新创建容器：

```bash
docker compose up -d --force-recreate
```

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

打开 `.env`，设置 `ADMIN_PASSWORD` 等开发配置，然后运行：

```bash
bun run dev
```

开发服务器默认监听后端 `17321`，前端开发页面为 `http://127.0.0.1:5173`。生产构建可运行 `bun run build`，然后执行 `bun start`；生产运行使用进程环境变量，不需要 `.env` 文件。
