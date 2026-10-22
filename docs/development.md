# 开发指南

## 环境要求

需要安装 [Bun](https://bun.sh/)（版本 `>=1.1.0`）。

## 启动开发环境

```bash
bun install
bun run dev
```

开发模式默认使用 `./data` 作为数据目录、`17321` 作为后端端口，并启动 Vite 开发服务器。打开终端显示的 Vite 地址（通常为 `http://localhost:5173`）。

可参考根目录的 [.env.example](../.env.example) 配置本地环境。开发模式会加载本地 `.env`；Docker 容器不会自动加载挂载目录中的 `.env` 文件。

## 常用命令

```bash
# TypeScript 检查：根目录、共享代码、服务端和客户端
bun run typecheck

# 代码正确性：类型检查、客户端构建、翻译检查（不运行单测）
bun run check

# 前后端单元测试，并分别强制检查覆盖率门槛
bun run test

# 单独运行前端或后端测试
bun run test:client
bun run test:server

# 单独重新检查前后端覆盖率
bun run test:coverage

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

## 检查范围

`bun run check` 只执行代码正确性检查：类型检查、客户端构建和翻译检查，不运行单元测试。`bun run test` 独立运行 Bun 核心测试及前端/后端 Vitest 测试，并分别强制检查覆盖率。前端与后端的语句、分支、函数、行覆盖率门槛均为 90%。这不是完整的 API/SQLite 集成测试或端到端测试。

镜像发布工作流会先运行 `bun run check`，通过后才构建并发布镜像。`代码质量检查` 工作流会按阶段执行 `bun run check`、前后端单元测试和覆盖率报告，最终由 `前后端单测与覆盖率门槛` Job 汇总并决定检查是否通过。当前仓库没有独立的轻量 YAML 配置校验工作流。

提交前 Husky 钩子会自动运行 `bun run check`。如果需要手动验证，也可以运行：

```bash
bun run check
bun run format:check
```

## 项目结构

- `client/src/`：Vue 3 前端、路由、组件、界面与中英文翻译。
- `server/routes/`：HTTP 路由与管理 API。
- `server/services/`：PAC 生成、远程列表、工作流、定时任务、Webhook 与请求监控。
- `server/db/`：SQLite 连接、schema、设置、工作流和监控数据。
- `shared/`：客户端与服务端共享的契约和翻译类型。
- `scripts/`：开发启动、翻译检查、生产启动和管理员密码重置脚本。
- `docs/`：部署、配置、开发、运维和故障排查文档。
