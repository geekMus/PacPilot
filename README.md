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

### 3. 检查部署配置

**Docker 部署不需要创建 `.env` 文件，也不需要设置额外的配置环境变量。** 请直接检查项目根目录的 `docker-compose.yml`：

- `ADMIN_PASSWORD` 默认是 `password`。**请务必在部署前尽快修改为自己的强密码**，否则任何能访问后台登录页的人都可能尝试这个公开的默认密码。
- `SESSION_SECRET` 默认注释，不启用单独的签名密钥。程序会根据 `ADMIN_PASSWORD` 派生默认签名密钥。需要使用单独的会话签名密钥时，再取消对应注释并设置自己的随机字符串。
- 时区、监听地址、容器内部端口和数据目录都已固定，不需要在 shell 或部署平台里设置环境变量。
- 默认使用 `bridge` 网络，不发布宿主机端口；需要从宿主机访问时再启用端口映射。数据持久化则按前文所述选择一种挂载方式。

本项目的 Compose 文件不通过 `${...}` 从 shell 或 `.env` 中读取配置。即使部署目录内已有开发用的 `.env`，这些配置也不会被其覆盖。
### 4. 构建并启动

构建依赖默认使用国内镜像源：

- **Bun 基础镜像：** DaoCloud Docker Hub 代理 `m.daocloud.io/docker.io/oven/bun:1-alpine`，在 Dockerfile 中固定配置（[DaoCloud 说明](https://github.com/DaoCloud/public-image-mirror)）。
- **Bun / npm 包：** Dockerfile 中的依赖安装命令临时指定 `NPM_CONFIG_REGISTRY=https://registry.npmmirror.com`，只影响镜像构建，不改变本机开发时的包源。Bun 支持通过该环境变量指定 registry（[Bun 文档](https://bun.com/docs/pm/npmrc)）。
- **系统时区：** 不再安装 `tzdata` 或 `curl`，因此构建不需要访问 Alpine APK 软件源。系统层使用 POSIX `TZ=UTC-8` 表示固定 UTC+8，应用内日期格式化仍使用 `Asia/Shanghai`。

镜像地址固定写在项目配置中，不依赖部署者额外设置镜像环境变量。构建时仍需能够访问 DaoCloud 基础镜像和 npmmirror 包源；时区设置不再下载 Alpine 系统包，因此不会因 Alpine APK 源的 DNS 错误而失败。

确认当前目录是项目根目录（里面有 `docker-compose.yml`），并按需完成端口映射和数据挂载配置，然后执行：

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

将示例 IP 换成实际部署设备的地址。该访问方式只有在手动启用 Compose 中的端口映射后才可用。

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

容器数据路径固定为 `/data`，且该目录已通过 Dockerfile 的 `VOLUME` 声明；容器默认工作目录也设置为 `/data`，例如执行 `docker exec -it genpac-runner sh` 进入 shell 后，当前目录就是 `/data`。建议在 Compose 中启用一种显式挂载：使用命名卷时，执行 `docker compose down` 不会删除该数据卷；使用 `./data:/data` 目录挂载时，数据保存在项目的 `data` 目录。若不配置显式挂载，Docker 会创建匿名卷，容器重建时不一定自动复用旧卷。迁移或备份时请一并保存相应数据。

业务配置都在网页的「配置管理」中完成。Docker 部署时，后台管理密码在 `docker-compose.yml` 中配置，默认值为 `password`，部署前应尽快修改。应用内日期格式固定使用 `Asia/Shanghai`（UTC+8）；为避免构建时安装 `tzdata`，系统层通过 POSIX `TZ=UTC-8` 设置相同的固定偏移。监听地址固定为 `0.0.0.0`，内部端口固定为 `17321`，数据目录固定为 `/data`；宿主机端口映射和数据挂载则直接在 `docker-compose.yml` 中按需取消注释并修改。

## 常见问题

**提示 `docker: 'compose' is not a docker command`**

说明 Docker Compose 插件未安装，或 Docker CLI 无法找到它。请按 [Docker Compose 官方安装文档](https://docs.docker.com/compose/install/) 安装后，再运行 `docker compose version` 检查。若系统已安装旧式独立命令，可尝试 `docker-compose --version` 和 `docker-compose up -d --build`。

**下载容器依赖时提示 EOF、超时或连接重置**

项目默认使用 DaoCloud Bun 基础镜像代理和 npmmirror 的 Bun/npm 包源；时区设置不需要安装 Alpine APK 包。如果构建失败，先检查 Dockerfile 中的 `FROM` 镜像地址和依赖安装命令里的 `NPM_CONFIG_REGISTRY`，并确认 Docker/BuildKit 能解析并访问相应地址。

**访问不了网页**

检查容器是否启动成功、端口是否被占用，并查看 `docker compose logs -f genpac`。如果从局域网其他设备访问，请确认服务器防火墙允许访问所配置的宿主机端口。

**后台无法登录**

检查 `docker-compose.yml` 中的 `ADMIN_PASSWORD` 是否设置为你实际使用的密码。修改后重新创建容器使配置生效：

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
