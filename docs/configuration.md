# 配置说明

本文只讲**应用内配置**：PAC 生成模式、规则写法、定时生成、数据文件语义与管理员密码重置。这些配置保存在数据库中，通过管理后台修改，修改后即时生效。

启动参数（端口、数据目录、存储驱动、跨域来源、反向代理与真实 IP 等）与各部署方式的完整说明在[部署指南](deployment.md)的[环境参数参考](deployment.md#环境参数参考)中统一维护。

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

同一行可以用英文逗号分隔多条规则（例如 `example.com, *.example.org`），效果等同于分成多行书写。

内置本机直连策略覆盖 localhost、无点号主机名、IPv4 回环地址和 RFC 1918 私有地址。黑名单优先于自定义直连规则；自定义直连与黑名单规则优先于远程列表。

### 远程规则模式

填写远程列表 URL，生成时服务会下载并解析列表。支持：

- GFWList（Base64 编码列表）
- 域名型 AutoProxy / ABP 列表
- 每行一个域名的纯文本列表

解析器会提取域名规则，并非通用 ABP 引擎；不能假定所有 ABP 过滤表达式都能按原意处理。远程地址必须能从运行 PacPilot 的主机或容器访问。

### 定时生成

在配置中填写标准的五段 Cron 表达式，并选择有效的 IANA 时区。默认时区为 `Asia/Shanghai`；留空则不启用定时任务。已有工作流尚未结束时，新的定时触发会被跳过，以免重复任务不断积压。

## 数据文件与数据库

- `database.db`：SQLite 数据库，保存配置、管理员凭据、工作流记录、请求监控数据和远程规则快照。
- `pac.rule-source.json`（artifact）：远程规则的规范化快照，仅在远程规则模式下存在；重启后据此重建 PAC，无需重新拉取。

PAC 不再以文件形式产出。`/pac` 返回的内容由进程内存中的渲染结果提供：

- 代理字符串、压缩、规则列表、远程 URL 提交后**立即生效**，无需手动生成；生成模式需点击「保存模式」按钮才会写入并触发重渲染；
- 进程启动时会预热内存缓存；远程模式从 `pac.rule-source.json` 重建，若快照不存在则 `/pac` 返回全量直连脚本并在日志中告警；
- 响应带 `ETag`，客户端再次请求时命中 `304` 只回传头部，节省带宽；响应头 `X-Pac-Cache` 标识本次是 `hit` / `stale` / `fallback`。

数据库使用 `PRAGMA user_version` 记录 schema 版本。当前版本为 `4`，启动时校验版本：版本不匹配（例如指向旧数据库或未来版本）会直接拒绝启动并提示删除数据目录重建，不执行任何迁移。升级前建议备份数据目录中的数据库。SQLite 文件本身不加密；管理员密码以带随机盐的 scrypt 哈希保存。

## 管理员密码重置

忘记密码时，可以通过重置脚本为**已有数据库**生成新密码。命令必须指向服务正在使用的数据目录；重置后原有管理会话会失效。

**Docker：**

```bash
docker exec -it pacpilot bun run /app/scripts/reset-admin-password.ts
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
bun run scripts/reset-admin-password.ts --production --data-dir "C:\PacPilot\data"
```

重置脚本会检查数据库是否存在，不会因为路径写错而创建空数据库。脚本只显示新生成的密码一次。默认容器名为 `pacpilot`；如果创建容器时使用了其他名称，请相应修改 `docker exec` 命令。
