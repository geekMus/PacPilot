# 运维与发布

## 工作流与日志

- **工作流页面**：查看当前任务、排队任务、阶段、结果、错误详情及历史记录。
- **单元测试摘要**：GitHub Actions 的 Step Summary 只显示前端、后端覆盖率汇总表；测试成功时隐藏冗长控制台输出，测试失败时才输出去除 ANSI 控制码的日志供排查。
- **网络监控页面**：查看 PacPilot 自身收到的请求，不代表客户端经代理访问网站的流量。
- **系统设置页面**：查看数据目录、数据库和日志占用，查看 PAC 文件大小与更新时间。
- **日志保留**：设置日志保留天数并执行清理，也可以手动清空日志。
- **PAC 文件维护**：可删除生成的 PAC 文件；删除后需要重新生成才能恢复。
- **恢复出厂设置**：会清除应用配置、管理员凭据、日志、工作流记录和 PAC 文件等应用数据。执行前请确认已备份需要保留的内容。

## Docker 镜像与版本

- 镜像：`ghcr.io/geekmus/pacpilot`
- 默认标签：`latest`
- 当前自动发布工作流构建 `linux/arm64` 镜像。
- 版本号以根目录 `package.json` 的 `version` 为准。
- 自动发布：`main` 分支上的 `package.json` 发生变更时触发；也可在 [GitHub Actions 发布页面](https://github.com/geekMus/PacPilot/actions/workflows/publish-image.yml) 手动运行工作流。
- 发布校验：版本日期必须是 `Asia/Shanghai` 当天；同一天的修订号必须高于 GHCR 的 `latest` 版本。版本号相同会跳过重复发布。

## 更新已部署容器

如果使用 Docker 命名卷 `pacpilot-data`，可按以下步骤更新：

```bash
docker pull ghcr.io/geekmus/pacpilot:latest
docker stop pacpilot
docker rm pacpilot
docker run -d \
  --name pacpilot \
  --restart unless-stopped \
  -p 17321:17321 \
  -v pacpilot-data:/data \
  ghcr.io/geekmus/pacpilot:latest
```

如果原部署使用了其他端口、卷名或额外环境变量，更新时请保留原配置。不要为了升级而删除持久化数据卷。升级前建议备份数据库和 PAC 文件。

## GitHub 仓库维护

- [代码质量检查](../.github/workflows/quality-checks.yml)：除 `main` 外的分支 push、任意目标分支的 Pull Request 都会运行项目检查、前后端测试并汇总覆盖率；但源分支为 `main`、目标分支为 `dev` 的 PR 会跳过检查，避免与合并后同步流程重复执行。也支持手动运行（仅允许选择 `main` 或 `dev`），不在 `main` 的 push 时触发。
- [主分支包含性检查](../.github/workflows/main-inclusion.yml)：任意目标分支的 Pull Request 都会检查 PR 源分支是否包含最新 `main`；但源分支为 `main`、目标分支为 `dev` 的 PR 会跳过检查。也支持手动运行（仅允许选择 `main` 或 `dev`），不响应 push。检查兼容 Squash Merge。
- [合并后同步 main 到 dev](../.github/workflows/sync-main-to-dev.yml)：目标为 `main` 的 PR 合并后，自动将最新 `main` 合并到 `dev`；也支持从 `main` 或 `dev` 手动运行。若存在冲突会停止并提示人工处理；同步成功后（包括 `dev` 已包含最新 `main`、无需新提交的情况），会显式触发 `dev` 的代码质量检查和主从同步检查。
- [构建并发布 Docker 镜像](../.github/workflows/publish-image.yml)：在 `main` 上校验版本并发布 ARM64 镜像到 GHCR。
- [清理废弃工作流运行记录](../.github/workflows/cleanup-obsolete-workflow-runs.yml)：定时清理已删除工作流留下的历史运行记录。
- [Agent 项目级强制规则](../AGENTS.md)：分支操作、工作流触发限制、发布权限与并发策略，新增或修改工作流前必须阅读。
- [Dependabot 配置](../.github/dependabot.yml)：每周检查 Bun 依赖和 GitHub Actions 依赖更新。
- [Release 分类配置](../.github/release.yml)：为 GitHub Release 自动生成分类说明。

### 工作流强制规则

新增或修改任何 GitHub Actions 工作流前，必须先阅读仓库根目录的 [`AGENTS.md`](../AGENTS.md)，并遵守以下不可自行放宽的规则：

1. **手动触发：每一个工作流都必须配置 `workflow_dispatch`。** 自动触发器不能替代手动运行入口。手动运行须通过 Job 条件明确限制执行分支：普通工作流仅允许 `main` / `dev`，发布工作流仅允许 `main`；清理废弃工作流记录是唯一不设置分支限制的特例。
2. **分支范围：** 代码质量检查（`quality-checks.yml`）在非 `main` 分支 push 时触发、任意目标分支的 PR 时触发，不在 `main` 的 push 时触发；主分支包含性检查（`main-inclusion.yml`）只响应任意目标分支的 PR，不响应 push。两者都必须支持手动运行，且手动运行仅允许 `main` 或 `dev` 实际执行。源分支为 `main`、目标分支为 `dev` 的 PR 会跳过这两项检查，避免重复执行。
   - 合并后同步工作流（`sync-main-to-dev.yml`）仅在目标为 `main` 的 PR 已合并时自动同步，另支持手动触发；同步操作只合并 `main` 到 `dev`，不强推或覆盖 `dev`。同步成功后通过 `workflow_dispatch` 显式启动两项检查，不依赖 `GITHUB_TOKEN` 推送触发 `push` 工作流。
3. **发布限制：** 所有正式发布动作只允许在 `main` 执行，并且发布相关 Job 都要有明确的 `main` 分支保护。
4. **唯一例外：** 清理废弃工作流记录只允许 `schedule` 和 `workflow_dispatch` 触发，不设置分支限制。
5. **并发隔离：** 每个工作流必须在工作流顶层使用以下配置，不能改成固定组名或省略任一字段：

   ```yaml
   concurrency:
     group: ${{ github.workflow }}-${{ github.ref }}
     cancel-in-progress: true
   ```

   这保证同一工作流、同一 ref 只保留最新运行；不同工作流或不同 ref 互不取消。
6. **验证与同步：** 修改后检查 `workflow_dispatch`、触发器、Job 条件、并发配置和 YAML 校验结果，并同步更新相关文档。未实际运行验证时必须如实说明。

工作流行为以仓库中的 YAML 文件为准；若本页与 [`AGENTS.md`](../AGENTS.md) 的强制规则有不一致，以 `AGENTS.md` 为准，并应及时修正文档。
