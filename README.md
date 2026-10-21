# genpac-runner

[![Docker 镜像](https://img.shields.io/badge/GHCR-genpac--runner-blue?logo=docker)](https://github.com/geekMus/genpac-runner/pkgs/container/genpac-runner)
[![GitHub Actions](https://github.com/geekMus/genpac-runner/actions/workflows/publish-image.yml/badge.svg?branch=main)](https://github.com/geekMus/genpac-runner/actions/workflows/publish-image.yml)
[![License](https://img.shields.io/badge/项目-开源代码库-lightgrey?logo=github)](https://github.com/geekMus/genpac-runner)

**genpac-runner** 是一个带 Web 管理后台的 PAC 生成与管理服务。它可以根据自定义规则或远程域名列表生成 `proxy.pac`，并提供工作流记录、定时更新、Webhook 通知、请求监控和数据维护功能。

项目使用 Bun、TypeScript、Vue 3 和 SQLite。部署时直接使用预构建的 Docker 镜像即可，不需要在服务器上克隆源码或安装构建工具。

## 功能一览

- **两种生成模式**：使用自定义规则，或从远程列表提取域名规则。
- **规则优先级**：自定义直连规则和黑名单优先于远程列表；内置本机及私有地址直连策略。
- **PAC 生成**：手动生成、保存配置后生成、定时生成；支持压缩输出。
- **远程列表**：支持 GFWList（Base64）、域名型 AutoProxy / ABP 列表，以及每行一个域名的纯文本列表。它不是完整的 ABP 广告过滤引擎。
- **工作流管理**：查看当前任务、队列、阶段、错误详情和执行历史；支持取消可取消的任务。
- **Webhook**：分别设置生成成功和失败通知，支持自定义 HTTP Webhook 与钉钉机器人，并可发送测试消息。
- **网络监控**：统计服务自身接收的页面、PAC 和 API 请求，并提供按需的代理连通性检测。
- **系统维护**：查看数据、数据库、日志及 PAC 文件占用；设置日志保留天数、清理日志、删除 PAC 文件或恢复出厂设置。
- **双语界面**：中文与 English；主题支持跟随系统、浅色和深色。语言和主题偏好保存在访问者的浏览器中。

## 快速部署

### Docker（推荐）

需要 Docker Engine。镜像地址：

```text
ghcr.io/geekmus/genpac-runner:latest
```

创建并启动容器：

```bash
docker run -d \
  --name genpac-runner \
  --restart unless-stopped \
  -p 17321:17321 \
  -v genpac-data:/data \
  ghcr.io/geekmus/genpac-runner:latest
```

然后打开 `http://<服务器地址>:17321/`。

- 容器内服务端口固定为 `17321`。
- `genpac-data` 是 Docker 命名卷，用于持久化 SQLite 数据库、配置、工作流和生成记录，以及 PAC 文件。
- 如果端口 `17321` 已被占用，可以将映射改成例如 `-p 8080:17321`，之后通过 `http://<服务器地址>:8080/` 访问。
- 首次启动会生成随机管理员密码，并在容器日志中输出一次。使用 `docker logs genpac-runner` 查看。
- 首次使用新数据库时**不会自动生成 PAC**。请先登录后台配置生成方式，再手动启动生成。生成前访问 `/proxy.pac` 会返回临时的全量直连脚本，不代表你的规则已生效。
- 使用已有数据库重启服务时，会执行一次启动生成工作流。

> **数据提醒：** 不要在需要保留数据时删除数据卷，也不要随意执行 `docker volume rm genpac-data`。升级前建议备份数据库和 PAC 文件。

### Docker Compose

仓库提供了 [docker-compose.yml](https://github.com/geekMus/genpac-runner/blob/main/docker-compose.yml)。默认配置使用预构建镜像，但**不会发布宿主机端口，也没有启用数据卷**。请按需在 `genpac` 服务下启用端口映射和持久化挂载，再启动：

```bash
docker compose pull
docker compose up -d
docker compose logs -f genpac
```

端口映射示例：

```yaml
ports:
  - "17321:17321"
```

持久化挂载任选一种，不要同时使用：

```yaml
# Docker 命名卷
volumes:
  - genpac-data:/data
```

或者：

```yaml
# 挂载到当前项目目录
volumes:
  - ./data:/data
```

如果使用命名卷，还需要在 Compose 文件顶层声明：

```yaml
volumes:
  genpac-data:
```

## 首次使用

1. 访问 `http://<服务器地址>:17321/` 打开公共状态页。
2. 在容器日志中找到首次启动生成的管理员密码，然后进入后台登录。
3. 在“设置 / 生成配置”中选择生成模式，配置默认代理、远程列表或自定义规则。
4. 保存配置并启动生成，在“工作流”页面查看任务阶段和结果。
5. 确认生成成功后，再把 PAC 地址配置到客户端。

### 常用地址

将下面的 `<服务器地址>:17321` 替换为实际访问地址。如果修改了宿主机端口，请使用映射后的端口。

| 页面或资源 | 地址 |
| --- | --- |
| 公共状态页 | `http://<服务器地址>:17321/` |
| PAC 源码 | `http://<服务器地址>:17321/proxy.pac` |
| 下载 PAC | `http://<服务器地址>:17321/proxy.pac?download=1` |
| 后台总览 | `http://<服务器地址>:17321/admin/dashboard` |
| 生成配置 | `http://<服务器地址>:17321/admin/settings` |
| 网络监控 | `http://<服务器地址>:17321/admin/monitor` |
| 工作流与历史 | `http://<服务器地址>:17321/admin/workflows` |
| 系统设置与维护 | `http://<服务器地址>:17321/admin/system-settings` |

公共状态页与 PAC 地址无需管理员登录。管理后台及管理 API 需要管理员会话。

## 生成规则说明

### 自定义规则模式

可配置默认代理、直连规则和黑名单。默认代理示例：

```text
SOCKS5 127.0.0.1:1080; DIRECT
```

PAC 会按代理列表顺序选择策略；请填写客户端实际能够访问的代理地址。genpac-runner 只生成 PAC，不会替你创建或转发 SOCKS/HTTP 代理。

域名规则支持以下常用写法：

| 写法 | 匹配范围 |
| --- | --- |
| `example.com` | 仅匹配该域名 |
| `*.example.com` | 匹配子域名，不包含根域名 |
| `**.example.com` | 同时匹配根域名及其子域名 |

内置本机直连策略覆盖 localhost、无点号主机名、IPv4 回环地址和 RFC 1918 私有地址。黑名单优先于自定义直连规则；自定义直连与黑名单规则优先于远程列表。

### 远程规则模式

填写远程列表 URL，生成时服务会下载并解析列表。支持：

- GFWList（Base64 编码列表）
- 域名型 AutoProxy / ABP 列表
- 每行一个域名的纯文本列表

该解析器会提取域名规则，并非通用 ABP 引擎；不能假定所有 ABP 过滤表达式都能按原意处理。远程地址必须能从运行 genpac-runner 的主机或容器访问。

### 定时生成

在配置中填写标准的五段 Cron 表达式，并选择有效的 IANA 时区。默认时区为 `Asia/Shanghai`；留空则不启用定时任务。已有工作流尚未结束时，新的定时触发会被跳过，以免重复任务不断积压。

## 配置与数据

### 启动环境变量

应用设置（代理、规则、Webhook、定时任务、日志保留时间）统一保存在 SQLite 中，通过后台配置。环境变量只用于启动参数和跨域访问策略。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `17321` | 非容器运行时的监听端口；容器内固定使用 `17321`。 |
| `HOST` | `0.0.0.0` | 非容器运行时的监听地址。 |
| `DATA_DIR` | 按运行环境决定 | 非容器运行时的数据目录。 |
| `CORS_ALLOWED_ORIGINS` | 空 | 显式允许访问管理 API 的跨域 Origin，多个来源以英文逗号分隔。 |

数据目录按运行方式确定：

- Docker：`/data`
- 开发模式：仓库目录下的 `./data`
- 非容器生产模式：操作系统的应用数据目录；也可使用 `DATA_DIR` 指定

开发模式可复制 [.env.example](https://github.com/geekMus/genpac-runner/blob/main/.env.example) 为 `.env`。Docker 容器只读取注入的环境变量，不会自动加载挂载目录中的 `.env` 文件。

### 数据文件

- `genpac.db`：SQLite 数据库，保存配置、管理员凭据、生成日志、工作流记录和请求监控数据。
- `proxy.pac`：提供给客户端使用的 PAC 文件。
- `proxy.source.pac`：未压缩的 PAC 来源文件，供状态页解析和检查。

数据库使用 `PRAGMA user_version` 跟踪 schema 版本，并在启动时执行增量迁移。升级前仍建议备份数据目录中的数据库及 PAC 文件。SQLite 文件本身不加密；管理员密码以带随机盐的 scrypt 哈希保存。

### 跨域与访问安全

默认不开放跨域浏览器访问管理 API。只有将管理前端独立部署在其他 Origin 时，才需要配置 `CORS_ALLOWED_ORIGINS`，例如：

```text
CORS_ALLOWED_ORIGINS=https://admin.example.com,https://ops.example.com
```

请只添加自己控制的可信来源，不要使用通配符。管理 API 的状态变更请求会校验 Origin；跨域凭据请求可能携带管理员会话 Cookie，因此不要将不可信网站加入白名单。若服务放在反向代理后，请正确配置代理转发头，并避免直接暴露不必要的管理入口。

## 管理员密码

忘记密码时，可以通过重置脚本为**已有数据库**生成新密码。命令必须指向服务正在使用的数据目录；重置后原有管理会话会失效。

**Docker：**

```bash
docker exec -it genpac-runner bun run /app/scripts/reset-admin-password.ts
```

**本机开发：**

```bash
bun run reset:admin-password:development
```

**非容器生产部署：**

```bash
bun run reset:admin-password:production
```

也可以显式指定数据目录：

```bash
bun run scripts/reset-admin-password.ts --production --data-dir "/path/to/data"
```

Windows PowerShell 示例：

```powershell
bun run scripts/reset-admin-password.ts --production --data-dir "C:\genpac\data"
```

重置脚本会检查数据库是否存在，不会因为路径写错而创建空数据库。脚本只显示新生成的密码一次。容器名若不是 `genpac-runner`，请修改对应的 `docker exec` 命令。

## 工作流、日志与维护

- **工作流页面**：查看当前任务、排队任务、阶段、结果、错误详情及历史记录。
- **网络监控页面**：查看 genpac-runner 自身收到的请求，不代表客户端经代理访问网站的流量。
- **系统设置页面**：查看数据目录、数据库和日志占用，查看 PAC 文件大小与更新时间。
- **日志保留**：设置日志保留天数并执行清理，也可以手动清空日志。
- **PAC 文件维护**：可删除生成的 PAC 文件；删除后需要重新生成才能恢复。
- **恢复出厂设置**：会清除应用配置、管理员凭据、日志、工作流记录和 PAC 文件等应用数据。执行前请确认已备份需要保留的内容。

## 本机开发

需要安装 [Bun](https://bun.sh/)（要求版本 `>=1.1.0`）。

```bash
bun install
bun run dev
```

开发模式默认使用 `./data` 作为数据目录、`17321` 作为后端端口，并启动 Vite 开发服务器。打开终端显示的 Vite 地址（通常为 `http://localhost:5173`）。

常用命令：

```bash
# TypeScript 检查：根目录、共享代码、服务端和客户端
bun run typecheck

# 完整检查：类型检查、客户端构建、翻译检查
bun run check

# 仅检查中英文翻译目录及静态翻译 key
bun run check:i18n

# 检查代码格式
bun run format:check

# 按项目配置格式化代码
bun run format

# 构建客户端
bun run build

# 生产模式启动（需先构建）
bun start
```

`bun run check` 不会启动完整服务，也不替代端到端测试或数据库迁移测试。

## Docker 镜像与版本

- 镜像：`ghcr.io/geekmus/genpac-runner`
- 默认标签：`latest`
- 发布平台：当前自动发布工作流构建 `linux/arm64` 镜像。
- 版本号：以 `package.json` 的 `version` 为准。
- 自动发布：`main` 分支上的 `package.json` 发生变更时触发；也可在 GitHub Actions 页面手动运行工作流。
- 发布校验：版本日期必须是 `Asia/Shanghai` 当天；同一天的修订号必须高于 GHCR 的 `latest` 版本。版本号相同会跳过重复发布。

查看 [构建与发布工作流](https://github.com/geekMus/genpac-runner/actions/workflows/publish-image.yml)。

更新已部署容器：

```bash
docker pull ghcr.io/geekmus/genpac-runner:latest
docker stop genpac-runner
docker rm genpac-runner
docker run -d \
  --name genpac-runner \
  --restart unless-stopped \
  -p 17321:17321 \
  -v genpac-data:/data \
  ghcr.io/geekmus/genpac-runner:latest
```

如果原部署使用了其他端口、卷名或额外环境变量，更新时请保留原配置。不要为了升级而删除持久化数据卷。

## 故障排查

**无法访问网页**
- 确认容器正在运行：`docker ps`
- 确认已发布端口：`docker port genpac-runner`
- 查看服务日志：`docker logs --tail 200 genpac-runner`
- 检查宿主机防火墙、反向代理和端口映射。

**管理员无法登录**
- 查看首次启动日志中的随机密码。
- 若密码遗失，按“管理员密码”章节重置，并确认脚本使用的是正确的数据目录。

**PAC 仍是全量直连**
- 新数据库首次启动不会自动生成 PAC。
- 在后台启动生成，并在工作流页面确认结果成功。
- 检查生成模式、代理地址、自定义规则和远程列表的可访问性。

**远程列表生成失败**
- 确认容器能够访问配置的 URL。
- 确认内容属于支持的列表格式；该功能不是完整的 ABP 规则引擎。

**升级后配置丢失**
- 检查容器是否始终挂载到同一个持久化卷或数据目录。
- 没有挂载 `/data` 时，删除容器可能导致应用数据丢失。

---

项目源码、问题反馈与版本记录：[geekMus/genpac-runner](https://github.com/geekMus/genpac-runner)
