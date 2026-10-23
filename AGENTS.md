# Agent 工作约定

本文件是本仓库自动化代理必须遵守的项目级指令。开始任何任务前先阅读本文件；修改 GitHub Actions 前还必须检查 [`docs/operations.md`](docs/operations.md) 和现有工作流。工作流维护说明与规则在这两个文件中同步维护；若两者不一致，以本文件 `AGENTS.md` 的强制规则为准，并及时修正文档。

## Git 分支与工作流程

- **长期硬规则：本项目所有代码、文档、配置与工作流的新增和修改，只能直接在 `dev` 分支进行。** 每次任务默认以 `dev` 为唯一工作分支；不得切换到 `main` 或其他分支开展工作，不得向 `main` 直接提交或推送，也不得创建其他工作分支。`main` 仅作为受保护的发布分支，通过 GitHub Pull Request 合入；必要时可以只读查看 `main` 以进行比较，但不能在其上修改。
- 每次开始工作前，先读取/拉取 `dev` 的最新内容，再基于最新版本分析和修改。不要依赖旧对话中的文件内容或 SHA。
- 当前长期保留的分支只有 `main` 和 `dev`。除非维护者明确要求，不要创建、恢复或建议新增长期分支。
- 修改前检查现有实现，尽量做最小、完整的变更；完成后检查实际文件内容，并报告提交结果、验证情况和未验证事项。

## 提交规范

> 适用范围：本节约定只针对本仓库（PacPilot）。其他项目的提交与工作流要求以各自的约定为准，不要套用本文件。

- **每次任务完成后必须直接提交，不需要再询问维护者。** 只提交本次任务实际改动的文件，不要顺手提交无关改动、构建产物或临时文件。
- **提交信息使用中文描述**，并遵循常见开源项目的 Conventional Commits 格式：

  ```
  <type>(<scope>): <中文简要描述>

  <可选的正文：说明改动动机、关键取舍或影响范围>
  ```

- `<type>` 使用常见取值：`feat`（新功能）、`fix`（缺陷修复）、`refactor`（重构）、`style`（样式/格式）、`perf`（性能）、`docs`（文档）、`test`（测试）、`build`（构建依赖）、`ci`（工作流）、`chore`（杂项）。`<scope>` 可选，用简短的模块名，例如 `feat(webhook): 实现工作区粘性布局`、`fix(public): 修复 PAC 响应序列化错误`。
- 描述使用祈使/陈述语气，简洁说明「做了什么」，不要写「更新文件」这类无信息量的内容；一次提交聚焦一个完整变更，避免把多个不相关的修改混在一起。
- 若提交涉及破坏性变更，在正文中补充 `BREAKING CHANGE:` 说明。
- 提交前必须完成本文件要求的验证（`bun run check`、`bun run test`）；因环境限制确实无法运行的项目，必须在回复中如实说明，不能声称已通过。

## 单元测试目录规范

- 前端单元测试统一放在 `client/tests/`，后端单元测试统一放在 `server/tests/`，让测试随所属代码边界一起迁移。
- 前端和后端分别维护自己的 Vitest 配置、测试发现范围和覆盖率报告；不要把前后端单测放回仓库根目录的统一 `tests/` 目录。
- 新增或迁移测试后，必须同步检查对应 Vitest 配置、`package.json` 测试脚本、TypeScript 检查范围和开发文档；验证 `bun run test` 能运行两套测试与覆盖率门槛。


## 前端组件分层与编辑器规范

- `client/src/components/` 只放跨页面通用组件；业务专属组件放在 `client/src/features/<feature>/components/`，页面组件负责组合而不是复制通用组件实现。
- `client/src/components/CodeMirrorField.vue` 是唯一允许创建和管理 CodeMirror `EditorView` 的组件。当前编辑器语言仅支持 `text` 和 `json`；未经维护者明确要求，不要加入其他语言模式或对应依赖。业务组件可以通过参数和 extensions 配置主题、行号及诊断扩展，但不得再创建 `EditorView`、维护重复生命周期或自行实现编辑器滚动条。
- 新增通用能力时优先扩展现有公共组件；只有交互语义不同且确实需要跨页面复用时，才新增一个公共组件。不要为同一种通用能力创建多个并列实现。
- 文件和目录名统一使用 `kebab-case`；TypeScript 类型/类使用 `PascalCase`，变量/函数使用 `camelCase`，真正的全局常量使用 `UPPER_SNAKE_CASE`。
- 组件移动或重命名后必须同步更新所有导入路径并删除旧实现；完成后运行 `bun run check` 和 `bun run test`，并明确区分 CI 验证与真实浏览器视觉验证。

## 后端分层与数据库适配器规范

- 后端目录、依赖方向和 TypeScript 命名约定见 `docs/backend-architecture.md`；新增或替换持久化驱动前必须阅读 `docs/storage-adapter-contract.md`。
- `server/storage/repositories.ts` 是唯一公共存储契约来源。任何数据库适配器都必须实现其中定义的 repository 接口和 `ApplicationStorage` 聚合结构，保持相同的返回值、缺失值、分页、ID、时间格式和事务语义；不要让数据库驱动类型泄漏到业务层。
- 内存实现只放在 `server/storage/memory/`；SQLite 的连接、schema/migrations 和 SQL 查询只放在 `server/storage/sqlite/`；文件/对象存储等非数据库持久化实现应与具体数据库目录分离。
- 新增适配器时必须同步更新驱动配置与组合入口、实现契约测试，并验证现有数据迁移；不能只通过 TypeScript 编译就认为实现完成。

## 前端滚动区域开发规范

- 普通页面、弹窗、表格、下拉菜单、列表等需要独立滚动的区域，优先使用共享组件 `client/src/components/AppScrollArea.vue`，或使用已经在内部集成该组件的布局/业务组件；不要在业务页面中重复实现滚动条结构。
- 新增滚动区域前，先判断滚动应该由哪一层负责。页面级滚动交给页面布局，弹窗内容滚动交给 `AppDialog`，表格和独立列表由对应组件管理；避免父子容器同时滚动导致滚动条嵌套、滚动穿透或滚动区域边界不清晰。
- **嵌套滚动区必须允许滚动链（scroll chaining）。** 内层滚动到上/下边界后，滚轮应继续传递给外层，最终由页面接管，不允许出现"内层滚到底、外层纹丝不动"的死区。`AppScrollArea.vue` 的 `overscroll` 属性默认值即 `"auto"`（允许链式滚动）；只有会阻断页面交互的浮层（弹窗、抽屉、下拉菜单等）才显式传 `overscroll="contain"`。
- 不要在业务页面里自行书写 `overscroll-behavior` 覆盖共享组件的默认行为；确需阻断时必须通过 `AppScrollArea` 的 `overscroll` 属性表达意图，保持全局行为一致。
- **滚动条只在内容真正溢出时出现。** 使用 `AppScrollArea` 的 `type="auto"`（内部按 `scrollHeight > offsetHeight` 判断），不要使用 `type="always"`：该模式会无条件渲染滚动条，导致空状态或内容不足时出现一根滚不动的滚动条。
- 所有页面和组件的滚动条视觉必须统一，包括普通页面、表格、弹窗、下拉框、CodeMirror 等编辑器、文本输入控件及第三方组件内部滚动区。优先复用 `AppScrollArea.vue` 的交互/结构；确实必须保留原生或第三方内部滚动机制时，也必须通过 `scrollbars.css` 使用相同的尺寸、轨道、滑块和悬停配色。
- 只有在组件的交互行为确实需要、且共享组件无法满足时，才新增原生 `overflow: auto` / `overflow: scroll` 滚动容器；应在代码结构或注释中清晰表达其用途，并确保不会与外层滚动区域产生不必要的嵌套。
- 共享滚动容器的底层实现统一维护在 `AppScrollArea.vue`。业务组件不要直接拼装 Reka UI 的 ScrollArea primitives，也不要为单个页面另写一套滚动条外观；如共享组件缺少必要能力，应先扩展共享组件再由业务层使用。对于 Reka UI `SelectViewport`、`ComboboxViewport` 等需要 `as-child` 的特殊列表，使用 `AppScrollArea` 的 `viewport` 插槽组合对应视口；只有共享组件内部（例如 `AppSelect.vue`）才允许直接维护 ScrollArea primitives，并且必须复用 `scrollbars.css` 的统一样式。
- 以上是开发规范，依靠开发者在设计和代码评审时遵守；不额外添加自动扫描或阻断构建的检查代码。

## GitHub Actions 工作流硬性规则

### 1. 触发分支范围

- 普通工作流的自动触发（例如 `push`、`pull_request`）只允许面向 `main` 和 `dev`。
- 对 `push` 事件，使用 `branches: [main, dev]`（或等价的 YAML 列表）限制分支。
- 对普通 `pull_request` 事件，限制的是 PR 的**目标分支**，只允许 `main` 和 `dev`。
- **全局手动触发规则：** 工作流通常必须配置 `workflow_dispatch`；`quality-checks.yml`、`main-inclusion.yml` 和 `sync-main-to-dev.yml` 是明确例外，不配置手动触发器。
- **工作流专属触发规则：** `quality-checks.yml` 仅在 `dev` push 以及目标分支为 `main` / `dev` 的 PR 时触发；`main-inclusion.yml` 仅在目标分支为 `main` / `dev` 的 PR 时触发。两者不响应其他分支 push 或目标分支为其他分支的 PR，不创建被跳过的工作流运行。
- `workflow_dispatch` 即使保留为手动入口，也必须通过 job 级 `if` 或等效的明确校验限制实际执行范围；不能仅隐藏入口或依赖用户自行选择正确分支。发布工作流的手动运行只允许 `main` 实际执行；清理废弃工作流记录是唯一不设置分支限制的特例。
- `.github/workflows/sync-main-to-dev.yml` 仅在目标为 `main` 的 PR 已合并时自动同步，不配置手动触发；同步只合并 `main` 到 `dev`，不强推或覆盖 `dev`。同步产生的 `GITHUB_TOKEN` push 不会触发其他工作流。
- 新增任何工作流时，先明确分类它的自动触发、手动触发和例外，再实施分支限制。不能因为工作流文件不同而忽略这条规则。

### 2. 发布权限

- 所有会发布、推送或覆盖正式发布产物的工作流（包括 Docker 镜像发布）只允许在 `main` 上实际执行。
- 对发布工作流的每个可执行发布阶段/Job 都要设置明确的 `main` 分支保护条件；不能只依赖触发器限制。
- 自动发布触发条件也必须显式限制在 `main`。手动入口可以保留，但从非 `main` 引用触发时不得执行发布阶段。

### 3. 唯一的分支限制例外：清理废弃工作流记录

- `.github/workflows/cleanup-obsolete-workflow-runs.yml` 是特例：只允许由 `schedule` 定时触发和 `workflow_dispatch` 手动触发；**不对分支设置限制**。
- 该清理工作流不应增加 `push`、`pull_request` 等触发器，也不能因普通工作流的分支规则而加上 `main`/`dev` 限制。
- 这项例外只针对触发方式与分支范围，不豁免并发规则和其他安全检查。

### 4. 并发规则：工作流级别必须保持“同工作流 + 同 ref”隔离

每个工作流都必须在**工作流顶层**配置以下并发策略（除非维护者明确要求改变行为）：

```yaml
# 同一工作流、同一 ref 只保留最新运行；不同工作流或不同 ref 互不取消。
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

此规则必须用于普通工作流、发布工作流和清理工作流。它意味着：

- 同一分支/引用上的**不同工作流**可以并行运行，互不取消。
- 同一工作流在**不同分支/引用**上的运行可以并行，互不取消。
- 同一工作流在同一分支/引用上再次触发时，新运行会取消正在运行的旧运行；GitHub Actions 同一并发组中已等待的旧运行也会被新运行替换。
- 不要将并发组简化为固定名称、只使用 `${{ github.ref }}`，或只使用 `${{ github.workflow }}`，否则会破坏上述隔离规则。
- 不要移除 `cancel-in-progress: true`，也不要将并发配置只放到某个 Job，除非维护者明确要求更改策略。

### 5. 修改工作流前后的检查清单

每次新增或修改 `.github/workflows/*.yml` / `.yaml` 时，必须：

1. 先阅读本文件和 `docs/operations.md`，并读取 `dev` 上最新的相关工作流。
2. 确认每个工作流都配置 `workflow_dispatch`（上述三个明确例外除外），并核对触发器、目标分支限制、手动触发的 job 级保护以及发布权限符合上述规则。
3. 确认工作流顶层存在正确的 `concurrency` 配置，且三个部分的值完全符合示例。
4. 检查是否有新增触发器、Job 或发布步骤绕过了限制。
5. 运行项目提供的 GitHub 配置/YAML 校验（若环境支持），并核对最终文件内容；若未实际运行验证，必须明确说明，不能声称通过。
6. 如工作流行为或维护方式变化，同步更新 `docs/operations.md` 及其他相关文档。

若任务要求与本文件冲突，以维护者在当前任务中的明确指示为准；如有不清楚之处，先询问，不要自行放宽限制。
