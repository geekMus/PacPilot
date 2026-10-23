# 前端架构与组件约定

## 目录职责

- `client/src/components/` 只放跨页面复用的通用 UI 原语与组件，例如 `AppDialog.vue`、`AppScrollArea.vue`、`AppSelect.vue`、`CodeMirrorField.vue`、`VirtualTable.vue`。
- 业务专属组件放在 `client/src/features/<feature>/components/`，例如域名规则组件位于 `features/domain-rules/components/`，Webhook 配置组件位于 `features/webhooks/components/`。不要因为组件使用了 Vue 或被一个页面异步加载，就把它放进公共组件目录。
- `client/src/views/` 负责页面级组合、路由状态与页面布局，不应复制公共组件内部实现。
- `client/src/composables/` 放跨组件的状态和行为逻辑；单个业务组件专用的逻辑优先留在所属 feature 中。
- `client/tests/` 存放前端测试；测试路径应尽量反映所验证的业务或组件边界。

## 编辑器唯一入口

`client/src/components/CodeMirrorField.vue` 是项目唯一创建和管理 CodeMirror `EditorView` 的公共组件。它统一负责：

- 编辑器实例的创建、销毁、文档同步与选区保留；
- 单行/多行、行号、换行、占位文本、只读/错误外观等通用能力；
- `text`、`json`、`javascript`、`java` 语言支持、默认语法着色，以及可传入的 CodeMirror 扩展；
- 深色主题适配；
- 与 `AppScrollArea.vue` 的滚动同步。

业务包装组件可以保留业务工具栏、示例填充、JSON 状态提示、域名规则诊断和跳转定位等专属功能，但必须通过 `CodeMirrorField` 使用编辑器实例。不要在 feature/view 中再次调用 `new EditorView`、自行维护 CodeMirror 生命周期或另写编辑器滚动条。确有新语言或编辑能力时，扩展公共组件的参数或扩展接口，不要复制一个编辑器组件。

## 公共组件复用边界

- 同一类通用交互应维护一个公共入口，不要为每个页面复制一份 Dialog、滚动区域、选择器或表格基础实现。
- `AppDialog.vue` 统一管理对话框外壳、焦点恢复与内容滚动；业务层通过插槽和参数组合内容。
- `AppScrollArea.vue` 是统一滚动区域。特殊的 Reka UI `SelectViewport` / `ComboboxViewport` 组合使用它的 `viewport` 插槽，不要在业务页面直接组装 ScrollArea primitives。
- `AppSelect.vue` 与可搜索 Combobox 是不同的交互语义，不应将复杂搜索控件伪装成普通下拉框；如需要跨页面复用，应新增一个有明确职责的通用 Combobox，而不是复制业务页面代码。
- `TableFrame.vue` 负责表格的滚动与布局框架，`VirtualTable.vue` 负责虚拟化表格数据渲染；两者职责不同，不应相互复制。
- 只有业务语义、状态或交互确实专属某一 feature 时，才在 feature 目录保留独立组件。不要为了“只有一个组件”而把业务诊断、工具栏等内容塞进公共 UI 原语。

## 命名和验证

- Vue、TypeScript 文件与目录统一使用 `kebab-case`；类型和类使用 `PascalCase`，变量与函数使用 `camelCase`，真正的全局常量使用 `UPPER_SNAKE_CASE`。
- 组件迁移后同步更新全部导入路径，删除旧路径，不保留只转发旧组件的重复包装。
- 涉及编辑器、弹窗、滚动区域或布局的变更，至少运行 `bun run check` 与 `bun run test`。CI 通过只能证明静态检查、构建和自动化测试通过；没有真实浏览器验收时，不应宣称桌面和移动端视觉验证已完成。
