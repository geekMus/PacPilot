# 配置说明

## PAC 生成模式

### 自定义规则模式

可配置默认代理、直连规则和黑名单。默认代理示例：

```text
SOCKS5 127.0.0.1:1080; DIRECT
```

PAC 会按代理列表顺序选择策略；请填写客户端实际能够访问的代理地址。PacPilot 只生成 PAC，不会替你创建或转发 SOCKS/HTTP 代理。

域名规则支持以下常用写法：

| 写法             | 匹配范围                 |
| ---------------- | ------------------------ |
| `example.com`    | 仅匹配该域名             |
| `*.example.com`  | 匹配子域名，不包含根域名 |
| `**.example.com` | 同时匹配根域名及其子域名 |

内置本机直连策略覆盖 localhost、无点号主机名、IPv4 回环地址和 RFC 1918 私有地址。黑名单优先于自定义直连规则；自定义直连与黑名单规则优先于远程列表。

### 远程规则模式

填写远程列表 URL，生成时服务会下载并解析列表。支持：

- GFWList（Base64 编码列表）
- 域名型 AutoProxy / ABP 列表
- 每行一个域名的纯文本列表

解析器会提取域名规则，并非通用 ABP 引擎；不能假定所有 ABP 过滤表达式都能按原意处理。远程地址必须能从运行 PacPilot 的主机或容器访问。

### 定时生成

在配置中填写标准的五段 Cron 表达式，并选择有效的 IANA 时区。默认时区为 `Asia/Shanghai`；留空则不启用定时任务。已有工作流尚未结束时，新的定时触发会被跳过，以免重复任务不断积压。

## 启动环境变量

应用设置（代理、规则、Webhook、定时任务、日志保留时间）统一保存在 SQLite 中，通过后台配置。环境变量只用于启动参数和跨域访问策略。

| 变量                   | 默认值         | 说明                                                         |
| ---------------------- | -------------- | ------------------------------------------------------------ |
| `PORT`                 | `17321`        | 非容器运行时的监听端口；容器内固定使用 `17321`。             |
| `HOST`                 | `0.0.0.0`      | 非容器运行时的监听地址。                                     |
| `DATA_DIR`             | 按运行环境决定 | 非容器运行时的数据目录。                                     |
| `CORS_ALLOWED_ORIGINS` | 空             | 显式允许访问管理 API 的跨域 Origin，多个来源以英文逗号分隔。 |

数据目录按运行方式确定：

- Docker：`/data`
- 开发模式：仓库目录下的 `./data`
- 非容器生产模式：操作系统的应用数据目录；也可使用 `DATA_DIR` 指定

开发模式可复制 [.env.example](../.env.example) 为 `.env`。Docker 容器只读取注入的环境变量，不会自动加载挂载目录中的 `.env` 文件。

## 数据文件与数据库

- `database.db`：SQLite 数据库，保存配置、管理员凭据、生成日志、工作流记录和请求监控数据。
- `proxy.pac`：提供给客户端使用的 PAC 文件。
- `proxy.source.pac`：未压缩的 PAC 来源文件，供状态页解析和检查。

数据库使用 `PRAGMA user_version` 跟踪 schema 版本，并在启动时执行增量迁移。升级前仍建议备份数据目录中的数据库及 PAC 文件。SQLite 文件本身不加密；管理员密码以带随机盐的 scrypt 哈希保存。

## 跨域与访问安全

默认不开放跨域浏览器访问管理 API。只有将管理前端独立部署在其他 Origin 时，才需要配置 `CORS_ALLOWED_ORIGINS`，例如：

```text
CORS_ALLOWED_ORIGINS=https://admin.example.com,https://ops.example.com
```

请只添加自己控制的可信来源，不要使用通配符。管理 API 的状态变更请求会校验 Origin；跨域凭据请求可能携带管理员会话 Cookie，因此不要将不可信网站加入白名单。若服务放在反向代理后，请正确配置代理转发头，并避免直接暴露不必要的管理入口。

## 管理员密码重置

忘记密码时，可以通过重置脚本为**已有数据库**生成新密码。命令必须指向服务正在使用的数据目录；重置后原有管理会话会失效。

**Docker：**

```bash
docker exec -it PacPilot bun run /app/scripts/reset-admin-password.ts
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

重置脚本会检查数据库是否存在，不会因为路径写错而创建空数据库。脚本只显示新生成的密码一次。容器名若不是 `PacPilot`，请修改对应的 `docker exec` 命令。
