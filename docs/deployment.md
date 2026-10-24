# 部署指南

## Docker（推荐）

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

然后访问 `http://<服务器地址>:17321/`。服务默认绑定 `0.0.0.0:17321`，因此在宿主机防火墙和 Docker 端口映射允许的前提下，可使用宿主机任一可达 IP 访问；浏览器通过服务自身地址访问时属于同源请求，不需要额外设置 CORS。

- 容器内服务端口固定为 `17321`。
- `pacpilot-data` 是 Docker 命名卷，用于持久化 SQLite 数据库、配置、工作流和请求监控记录，以及远程规则快照。
- 如果宿主机端口 `17321` 已被占用，可改成 `-p 8080:17321`，并通过 `http://<服务器地址>:8080/` 访问。
- 首次启动会生成随机管理员密码，并在容器日志中输出一次；若设置了 `DEFAULT_ADMIN_PASSWORD` 则使用该密码且不打印。使用 `docker logs pacpilot` 查看。
- PAC 由内存实时渲染，修改配置后立即生效，无需手动生成。远程规则模式下，首次保存设置即会拉取规则；此后只在定时任务触发时刷新。
- 新建数据库默认为自定义规则模式，`/pac` 立即可用。若切换到远程模式但尚未成功拉取规则，`/pac` 会返回全量直连脚本。

**重要：** 不要在需要保留数据时删除数据卷，也不要随意执行 `docker volume rm pacpilot-data`。升级前建议备份数据库。

## Docker Compose

仓库提供 [docker-compose.yml](../docker-compose.yml)。默认配置使用预构建镜像，但不会发布宿主机端口，也没有启用数据卷。请按需在 `pacpilot` 服务下启用端口映射和持久化挂载，再启动：

```bash
docker compose pull
docker compose up -d
docker compose logs -f pacpilot
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
  - pacpilot-data:/data
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
  pacpilot-data:
```

## 首次使用

1. 访问 `http://<服务器地址>:17321/` 打开公共状态页。
2. 进入后台登录，初始密码有两种来源：
   - **自行指定**：启动时设置 `DEFAULT_ADMIN_PASSWORD`（至少 8 位），服务会用它创建初始管理员，日志只提示已初始化、不打印密码；
   - **自动生成**：未设置该变量时，随机密码打印在启动日志中（`docker logs pacpilot`）。
3. 在“设置 / 生成配置”中选择生成模式，配置默认代理、远程列表或自定义规则。
4. 保存配置并启动生成，在“工作流”页面查看任务阶段和结果。
5. 确认生成成功后，再把 PAC 地址配置到客户端。

> `DEFAULT_ADMIN_PASSWORD` **只在首次初始化时生效**。数据库已有管理员凭据后，改该变量并重启不会重置密码；需要重置请用重置脚本。密码少于 8 位时服务拒绝启动并给出明确错误。

## 常用地址

将 `<服务器地址>:17321` 替换为实际访问地址。如果修改了宿主机端口，请使用映射后的端口。

| 页面或资源     | 地址                                              |
| -------------- | ------------------------------------------------- |
| 公共状态页     | `http://<服务器地址>:17321/`                      |
| PAC 源码       | `http://<服务器地址>:17321/pac`             |
| 下载 PAC       | `http://<服务器地址>:17321/pac?download=1`  |
| 后台总览       | `http://<服务器地址>:17321/admin/dashboard`       |
| 生成配置       | `http://<服务器地址>:17321/admin/settings`        |
| 网络监控       | `http://<服务器地址>:17321/admin/monitor`         |
| 工作流与历史   | `http://<服务器地址>:17321/admin/workflows`       |
| 系统设置与维护 | `http://<服务器地址>:17321/admin/system-settings` |

公共状态页与 PAC 地址无需管理员登录。管理后台及管理 API 需要管理员会话。

## 前后端分离部署（纯静态前端）

前端是纯静态站点，可以单独部署在 Cloudflare Pages、Vercel、Netlify 或任意静态托管上，后端继续运行在另一台主机（含 Docker、Cloudflare Tunnel 暴露的实例）。

### 1. 后端准备

```text
CORS_MODE=open
TRUST_PROXY_HOPS=1        # Cloudflare Tunnel 直连 1 跳；前面还有 Nginx 时为 2
TRUST_CLOUDFLARE_IP=1     # 通过 Cloudflare / cloudflared 暴露时开启
```

`CORS_MODE=open` 后管理接口改用 Bearer 令牌鉴权，登录接口返回 `{ token, expiresAt }` 且不下发 Cookie。

后端必须通过 **HTTPS** 对外提供服务：浏览器会拦截 `https` 页面请求 `http` 接口（混合内容），公网无法访问局域网地址。

### 2. 前端构建与配置

```bash
bun run build:client
```

产物在 `dist/client`。部署后在该目录放置 `config.json`：

```json
{ "apiBaseUrl": "https://api.example.com" }
```

- `apiBaseUrl` 为空字符串表示同源（默认自建部署），无需修改。
- 也可以改用构建期变量：`VITE_API_BASE_URL=https://api.example.com bun run build:client`（优先级高于 `config.json`）。
- 该文件在运行时读取，修改后刷新页面即可生效，不需要重新构建。

### 3. 平台注意事项

| 平台 | 方式 |
| --- | --- |
| Cloudflare Pages | 直接上传 `dist/client`；`config.json` 与 `index.html` 同目录 |
| Vercel | 静态站点，Output Directory 指向 `dist/client` |
| Netlify | Publish directory 指向 `dist/client` |
| 对象存储 / Nginx | 需要为 SPA 回退到 `index.html` |

### 4. 校验清单

1. 打开前端站点，进入 `/admin/login` 并登录。
2. 浏览器开发者工具确认请求发往 `apiBaseUrl`，且请求头带 `Authorization: Bearer …`。
3. 修改任一设置后刷新页面，数据仍然存在。
4. 在另一台设备上修改管理员密码后，本机下一次操作应提示重新登录（令牌随 `sessionSecret` 轮换失效）。
5. 在后端日志中确认记录的是真实客户端 IP，而不是 `172.x` 网段地址。
