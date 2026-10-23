# 开发指南

## 环境要求

需要安装 [Bun](https://bun.sh/)（版本 `>=1.1.0`）。

## 启动开发环境

```bash
bun install
bun run dev
```

开发模式默认使用 `./data` 作为数据目录、`17321` 作为后端端口，并启动 Vite 开发服务器。后端默认监听 `0.0.0.0:17321`，Vite 默认监听所有网络接口的 `5173` 端口。

除了终端显示的 `localhost` 地址，也可以从同一局域网的其他设备使用本机局域网 IP 访问，例如 `http://192.168.31.133:5173`（请替换为本机实际地址）。服务端会动态识别当前网络接口 IP，允许这些 IP 上的 Vite 默认端口以及服务端端口来源，不需要把每个本机 IP 写进 `CORS_ALLOWED_ORIGINS`。为避免信任同一主机上任意端口的其他 Web 服务，其他端口仍需显式配置。

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
bun run start
```

## 检查范围

`bun run check` 只执行代码正确性检查：类型检查、客户端构建和翻译检查，不运行单元测试。`bun run test` 独立运行前端与后端 Vitest 测试，并分别强制检查覆盖率。前端与后端的语句、分支、函数、行覆盖率门槛均为 90%。这不是完整的 API/SQLite 集成测试或端到端测试。

镜像发布工作流会先运行 `bun run check`，通过后才构建并发布镜像。`代码质量检查` 工作流会按阶段执行 `bun run check`、前后端单元测试和覆盖率报告，最终由 `前后端单测与覆盖率门槛` Job 汇总并决定检查是否通过。当前仓库没有独立的轻量 YAML 配置校验工作流。

提交前 Husky 钩子会自动运行 `bun run check`。如果需要手动验证，也可以运行：

```bash
bun run check
bun run format:check
```

## 项目结构

- `client/src/`：Vue 3 前端、路由、组件、界面与中英文翻译。
- `client/tests/`：仅属于前端的 Vitest 单元测试。
- `server/tests/`：仅属于后端的 Vitest 单元测试。
- `server/routes/`：HTTP 路由与管理 API。
- `server/services/`：PAC 生成、远程列表、工作流、定时任务、Webhook 与请求监控。
- `server/db/`：SQLite 连接、schema、设置、工作流和监控数据。
- `shared/`：客户端与服务端共享的契约和翻译类型。
- `scripts/`：开发启动、翻译检查、生产启动和管理员密码重置脚本。
- `docs/`：部署、配置、开发、运维和故障排查文档。


## 前端界面开发约定

- 普通页面、弹窗内容、表格主体和独立列表需要滚动时，优先复用 `AppScrollArea.vue` 或已集成它的布局/业务组件，不要重复实现滚动条结构与外观。
- 弹窗统一使用 `AppDialog.vue`，保持头部、内容区和底部操作区分离；不要为单个页面重新实现遮罩、弹窗外壳或内容滚动。
- 表格优先使用 `TableFrame.vue` / `VirtualTable.vue`，由表格组件负责固定表头、主体滚动和大列表渲染，避免页面各自维护滚动同步逻辑。
- CodeMirror、文本输入控件以及确实依赖自身滚动行为的第三方组件可以保留内部滚动机制；`AppSelect.vue` 为兼容 Reka UI 的选择器视口组合，允许在组件内部使用 ScrollArea primitives，但需沿用统一滚动条样式。
- 只有共享组件无法满足实际交互需求时，才新增原生滚动容器；避免不必要的嵌套滚动区域。此约定由开发者遵守并在代码评审中检查，不额外增加自动扫描或阻断构建的检查脚本。
