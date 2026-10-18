# genpac-runner

基于 **Bun** 的自动 PAC 生成工具（v2）。

- 运行时与开发均使用 **Bun**
- SQLite 使用 Bun 内置 **`bun:sqlite`**（无需 native 编译）
- 前端 **Vue 3 + TypeScript**，后端 **TypeScript + Express**
- 业务配置经后台写入 SQLite；仅启动级环境变量

---

## 目录结构

```
server/          # Bun 直接运行的 TS 后端
client/          # Vue 3 + Vite 前端
scripts/dev.ts   # bun run dev 并发启动
dist/client/     # 前端构建产物（生产由 Express 托管）
```

---

## 环境变量（仅启动级）

| 变量 | 默认 | 说明 |
|------|------|------|
| `DATA_DIR` | `/data` | SQLite 与 `proxy.pac` |
| `PORT` | `8080` | HTTP 端口 |
| `ADMIN_PASSWORD` | _(空)_ | 设置后启用 `/admin` |
| `SESSION_SECRET` | _(派生)_ | Cookie 签名（可选） |
| `TZ` | `Asia/Shanghai` | 时区 |

---

## 开发（Bun）

```bash
# 安装 Bun：https://bun.sh
bun install

DATA_DIR=./data ADMIN_PASSWORD=dev PORT=8080 bun run dev
```

- 后端：`bun --hot server/index.ts`（热重载）
- 前端：Vite `http://127.0.0.1:5173`（`/api` 代理到 8080）

单独启动：

```bash
bun run dev:server
bun run dev:client
```

生产本地：

```bash
bun run build          # 构建 Vue 到 dist/client
DATA_DIR=./data ADMIN_PASSWORD=dev bun start
```

---

## Docker（生产用 Bun）

```bash
docker compose build
docker compose up -d
```

镜像入口：`bun run server/index.ts`。

推荐挂载：

```yaml
volumes:
  - genpac-data:/data
```

---

## 路由

| 路径 | 说明 |
|------|------|
| `/proxy.pac` | PAC 文件 |
| `/status` | Vue 规则状态页 |
| `/admin` | Vue 后台 |
| `/api/*` | JSON API |

主题：右上角可切换 **自动 / 浅色 / 深色**（默认跟随系统）。

---

## License

MIT
