# genpac-runner

genpac-runner 根据自定义域名规则或远程域名列表生成 PAC 文件，并提供 Web 管理界面。可配置默认代理、直连规则、黑名单、定时生成和 Webhook 通知，也可查看服务自身的请求统计和代理连通性检测结果。

## 功能

- **自定义规则**：设置默认代理、直连域名和黑名单。localhost、无点号主机名、IPv4 回环地址及 RFC 1918 私网地址默认优先直连；黑名单优先于自定义直连规则。
- **远程规则**：读取 GFWList（Base64）、域名型 AutoProxy / ABP 列表或每行一个域名的纯文本列表。远程规则按域名提取，不是完整的 ABP 过滤规则引擎。自定义直连和黑名单规则优先于远程列表。
- **PAC 生成**：支持手动生成、保存配置并生成，以及 Cron 定时生成；可选压缩输出。生成结果、来源文件及执行历史可在后台查看。
- **Webhook**：分别配置生成成功和失败时的通知，支持自定义 HTTP Webhook 与钉钉机器人。
- **网络监控**：查看服务收到的网页、PAC 和 API 请求统计，按需测试 PAC 代理的连通性。
- **个人偏好**：主题支持跟随系统、浅色和深色；界面语言支持中文和 English。偏好保存在访问者的浏览器中，不写入服务端数据库。

## 快速部署（Docker Compose）

需要 Docker Engine 和 Docker Compose。项目提供的 Compose 配置使用预构建镜像：

```text
ghcr.io/geekmus/genpac-runner:latest
```

下载 [docker-compose.yml](https://github.com/geekMus/genpac-runner/blob/main/docker-compose.yml) 到部署目录。默认配置**不会**向宿主机开放端口，也**不会**持久化 `/data`。要从宿主机或局域网访问并保留数据，请在 Compose 文件的 `genpac` 服务中启用端口映射和一个数据卷，例如：

```yaml
services:
  genpac:
    ports:
      - "17321:17321"
    volumes:
      - genpac-data:/data

volumes:
  genpac-data:
```

在 Compose 文件所在目录启动：

```bash
docker compose pull
docker compose up -d
docker compose logs -f genpac
```

容器内端口固定为 `17321`，数据目录固定为 `/data`。也可以把 `./data` 挂载到 `/data`；不要同时配置命名卷和目录挂载。**不配置持久化挂载时，删除容器可能导致配置、凭据和生成记录丢失。** 不要在需要保留数据时执行 `docker compose down -v`。

首次启动后，在日志中找到 `[security] Initial admin password` 下方自动生成的随机密码，然后访问：

```text
http://<服务器地址>:17321/
```

公共状态页无需登录；通过页面中的后台入口登录管理界面。首次启动**不会自动生成 PAC**，需要时可在后台手动启动生成。首次启动的 PAC 文件尚不存在时，`/proxy.pac` 会返回临时的全量直连回退脚本；请先在后台生成并检查 PAC，再将其配置到客户端。已有数据库的服务重启时会运行一次启动生成工作流。

查看生成文件或下载 PAC 可使用公共状态页，也可以直接访问：

- 查看：`http://<服务器地址>:17321/proxy.pac`
- 下载：`http://<服务器地址>:17321/proxy.pac?download=1`
- 后台总览：`http://<服务器地址>:17321/admin/dashboard`
- 配置管理：`http://<服务器地址>:17321/admin/settings`
- 网络监控：`http://<服务器地址>:17321/admin/monitor`
- 工作流记录：`http://<服务器地址>:17321/admin/workflows`
- 系统设置：`http://<服务器地址>:17321/admin/system-settings`

如果改用了宿主机端口映射，例如 `8080:17321`，访问 URL 中应使用宿主机端口 `8080`。

## 本机运行

需要安装 [Bun](https://bun.sh/)（项目要求 Bun `>=1.1.0`）。在仓库根目录执行：

```bash
bun install
bun run dev
```

开发模式默认使用 `./data` 作为数据目录、`17321` 作为后端端口，并启动 Vite 开发服务器。打开终端输出的 Vite 地址（通常为 `http://localhost:5173`）。仓库中的 `.env.example` 可复制为 `.env`，按需设置 `DATA_DIR`、`PORT` 和 `HOST` 等运行参数。

构建并以生产模式运行：

```bash
bun run build
bun start
```

也可以在部署环境构建 Docker 镜像。Dockerfile 会执行服务端和客户端类型检查、构建客户端资源，并在运行镜像中启动 Bun 服务。

## 数据与安全

- SQLite schema 采用 `PRAGMA user_version` 跟踪版本；启动时执行事务化、向前兼容的增量迁移，不会要求删除现有数据库。升级前仍建议备份 `genpac.db` 及其相关文件。程序配置、管理员凭据、生成记录、工作流记录和监控记录存储在 SQLite 数据库 `genpac.db` 中。`proxy.pac` 是提供给客户端的生成文件；生成器还会在数据目录中保存 `proxy.source.pac` 来源文件。
- 数据目录默认值：开发模式为仓库下的 `./data`；Docker 为 `/data`；非容器生产模式使用操作系统的应用数据目录。可通过 `DATA_DIR` 指定非容器运行的数据目录。容器内端口固定为 `17321`；非容器运行时可通过 `PORT` 和 `HOST` 调整监听参数。
- SQLite 数据库文件**不加密**。管理员密码以带随机盐的 scrypt 哈希存储；其他配置和记录保存在本机数据库文件中。请限制对数据目录、备份和服务日志的访问，并为数据目录配置持久化和备份策略。
- 新数据库首次启动时自动创建随机管理员密码，并在服务日志中输出一次；重启不会重新生成密码。是否修改密码由管理员自行决定。能够读取首次启动日志的人也能读取该密码，请妥善保护日志。
- 管理员可在配置管理页面主动修改密码。忘记密码时，可以用重置命令为**已有数据库**生成新密码；重置会使现有管理会话失效。
- 默认不允许跨域浏览器访问管理 API。只有确有独立前端部署需求时，才通过 `CORS_ALLOWED_ORIGINS` 显式配置允许的 Origin，多个来源用英文逗号分隔；不要配置通配符或不可信来源。跨域凭据请求会携带管理员会话 Cookie，因此只应信任自己控制的来源。
- 访问者语言和主题偏好保存在浏览器本地。没有语言偏好时默认中文；主题默认跟随系统。
- 定时任务的默认时区为 `Asia/Shanghai`，可在配置管理中设置其他有效的 IANA 时区。

### 重置管理员密码

重置脚本会检查数据库文件是否已存在，不会因路径错误而创建一份空数据库。请确保命令使用的数据目录与服务相同。

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

也可显式指定数据目录：

```bash
bun run scripts/reset-admin-password.ts --production --data-dir "/path/to/data"
```

Windows PowerShell 示例：

```powershell
bun run scripts/reset-admin-password.ts --production --data-dir "C:\genpac\data"
```

脚本只显示新生成的密码一次。Docker 容器名不同于默认值 `genpac-runner` 时，请相应修改 `docker exec` 命令。

## 监控说明

监控页面每 **10 秒**自动刷新数据。请求统计只包括 genpac-runner 自身接收的请求，不代表用户经代理访问的网站，也不代表代理服务器实际转发的流量。代理连通性测试由运行 genpac-runner 的主机或容器发起，不等同于客户端设备上的实际代理测试。

## 开发检查

```bash
# 根目录脚本、共享代码、服务端与客户端 TypeScript 检查
bun run typecheck

# 自动化测试
bun run test

# 完整项目检查：类型检查、测试、客户端生产构建、静态翻译检查
bun run check

# 仅检查翻译目录与客户端静态翻译 key
bun run check:i18n

# 仅格式检查 / 格式化
bun run format:check
bun run format
```

`bun run check` 会检查根目录脚本、共享代码、服务端和客户端 TypeScript，运行自动化测试，构建客户端生产版本，并验证中英文翻译目录的键和占位符一致，以及客户端源码中使用的静态 I18N key 是否都存在。此命令不启动完整服务或执行端到端数据库迁移验证。

## 版本与镜像

容器镜像发布于 GitHub Container Registry（GHCR），支持 `linux/amd64` 和 `linux/arm64`。版本号以 `package.json` 中的 `version` 为准。新发布的镜像会在 OCI manifest annotation 中提供包描述（显示在 GHCR 包页面），并在镜像标签中记录版本、源码提交和相对上一镜像的简短变更摘要。可用下面的命令查看摘要：

```bash
docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.changelog" }}' ghcr.io/geekmus/genpac-runner:latest
```

部署现有服务时可使用 `docker compose pull` 拉取更新后的镜像；请在升级前备份 SQLite 数据库和 PAC 文件。

## 故障排查

- **无法访问页面**：确认 Compose 已启用端口映射、容器正在运行，并检查宿主机防火墙和 `docker compose logs -f genpac`。
- **登录凭据不可用**：查看首次启动日志中的随机密码；若密码遗失，按上文步骤重置，并确认命令指向服务正在使用的数据库。
- **没有可用 PAC**：首次数据库启动不会自动生成 PAC。进入后台配置后执行生成，并查看工作流记录中的结果。获取 PAC 前请确认生成成功。
- **远程列表加载失败**：确认运行服务的主机或容器能够访问列表 URL，并使用支持的列表格式。
