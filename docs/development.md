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

# 完整检查：类型检查、核心单元测试、客户端构建、翻译检查
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

## 检查范围

`bun run check` 依次执行类型检查、核心单元测试、客户端构建和翻译检查。单元测试覆盖 PAC 代理字符串校验及远程规则列表解析。它不会启动完整服务，也不替代端到端测试或数据库迁移测试。

GitHub Actions 另有独立的配置校验工作流，会检查工作流、Issue 表单、Dependabot 和 Release 分类配置的 YAML 语法。

提交前建议运行：

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
