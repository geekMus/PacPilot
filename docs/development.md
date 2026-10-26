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

# 本地预览生产构建（先构建，再以生产模式启动到 4173 端口、数据目录 ./data/preview）
bun run preview
```

### 本地预览生产构建

`bun run preview` 与 `bun run start` 都是生产模式启动，区别是默认值：

| 命令              | 端口    | 数据目录             | 是否先构建                   |
| ----------------- | ------- | -------------------- | ---------------------------- |
| `bun run start`   | `17321` | 操作系统标准数据目录 | 否（需自行 `bun run build`） |
| `bun run preview` | `4173`  | `./data/preview`     | 是                           |

预览用独立端口，因此可以和 `bun run dev` 的开发后端（`17321`）同时运行；独立数据目录保证预览不会写入开发或生产数据库。`PORT`、`DATA_DIR` 等环境变量显式设置后优先生效。

预览必须使用打包产物：Vite 开发服务器（`5173`）逐个加载未打包的 ES 模块，浏览器性能分析的结果与生产构建没有可比性。想核对首屏性能时请用 `bun run preview` 或 `bun run start` 的地址。

## 检查范围

`bun run check` 只执行代码正确性检查：类型检查、客户端构建和翻译检查，不运行单元测试。`bun run test` 先运行依赖 Bun 运行时的后端核心测试，再运行前端与后端 Vitest 测试，并分别强制检查覆盖率。前端与后端的语句、分支、函数、行覆盖率门槛均为 90%。这不是完整的 API/SQLite 集成测试或端到端测试。

覆盖率统计范围由 `server/vitest.config.ts` 和 `client/vitest.config.ts` 的 `coverage.include` 明确列出，只纳入能在 Node + jsdom 下完整执行的模块，避免把 0% 的路由层和 Bun-only 驱动混进阈值里稀释结果：

- 后端：`server/domain/`、`server/services/`、`server/storage/`、`server/utils/`。排除 `server/storage/repositories.ts`（纯类型契约）和 `server/storage/sqlite/`（依赖 `bun:sqlite`，只由 `bun test server/tests/storage-sqlite.bun.ts` 覆盖）。
- 前端：`client/src/api/`、`client/src/utils/`，以及 `client/src/composables/` 中可独立驱动的 `useTheme`、`useToast`、`useAdminSession`、`useWorkflowLabels`、`useCopyFeedback`、`useAdminPassword`。视图组件和依赖真实 DOM 布局的 dashboard composable 不纳入该门槛。

新增可测试模块时应把它加入对应的 `coverage.include` 并同步补齐测试，而不是只依赖编译通过。

镜像发布工作流会先运行 `bun run check`，通过后才构建并发布镜像。`代码质量检查` 工作流会按阶段执行 `bun run check`、前后端单元测试和覆盖率报告，最终由 `前后端单测与覆盖率门槛` Job 汇总并决定检查是否通过。当前仓库没有独立的轻量 YAML 配置校验工作流。

提交前 Husky 钩子会自动运行 `bun run check`。如果需要手动验证，也可以运行：

```bash
bun run check
bun run format:check
```

## 项目结构

- `client/src/`：Vue 3 前端、路由、组件、界面与中英文翻译；跨页面通用组件在 `components/`，业务专属组件在 `features/<feature>/components/`。
- `client/tests/`：仅属于前端的 Vitest 单元测试。
- `server/tests/`：仅属于后端的 Vitest 单元测试。
- `server/routes/`：HTTP 路由与管理 API。
- `server/services/`：PAC 生成、远程列表、工作流、定时任务、Webhook 与请求监控。
- `server/storage/`：存储契约与适配器（`memory/` 内存实现、`sqlite/` SQLite 连接/schema/查询、`filesystem/` 文件产物）。
- `shared/`：客户端与服务端共享的契约和翻译类型。
- `scripts/`：开发启动、翻译检查、生产启动和管理员密码重置脚本。
- `docs/`：部署、配置、开发、运维和故障排查文档。

界面开发约定（组件分层、滚动区域、弹窗、表格与命名规则）统一维护在[前端架构文档](frontend-architecture.md)，此处不再重复。
