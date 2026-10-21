# 运维与发布

## 工作流与日志

- **工作流页面**：查看当前任务、排队任务、阶段、结果、错误详情及历史记录。
- **网络监控页面**：查看 genpac-runner 自身收到的请求，不代表客户端经代理访问网站的流量。
- **系统设置页面**：查看数据目录、数据库和日志占用，查看 PAC 文件大小与更新时间。
- **日志保留**：设置日志保留天数并执行清理，也可以手动清空日志。
- **PAC 文件维护**：可删除生成的 PAC 文件；删除后需要重新生成才能恢复。
- **恢复出厂设置**：会清除应用配置、管理员凭据、日志、工作流记录和 PAC 文件等应用数据。执行前请确认已备份需要保留的内容。

## Docker 镜像与版本

- 镜像：`ghcr.io/geekmus/genpac-runner`
- 默认标签：`latest`
- 当前自动发布工作流构建 `linux/arm64` 镜像。
- 版本号以根目录 `package.json` 的 `version` 为准。
- 自动发布：`main` 分支上的 `package.json` 发生变更时触发；也可在 [GitHub Actions 发布页面](https://github.com/geekMus/genpac-runner/actions/workflows/publish-image.yml) 手动运行工作流。
- 发布校验：版本日期必须是 `Asia/Shanghai` 当天；同一天的修订号必须高于 GHCR 的 `latest` 版本。版本号相同会跳过重复发布。

## 更新已部署容器

如果使用 Docker 命名卷 `genpac-data`，可按以下步骤更新：

```bash
docker pull ghcr.io/geekmus/genpac-runner:latest
docker stop genpac-runner
docker rm genpac-runner
docker run -d \
  --name genpac-runner \
  --restart unless-stopped \
  -p 17321:17321 \
  -v genpac-data:/data \
  ghcr.io/geekmus/genpac-runner:latest
```

如果原部署使用了其他端口、卷名或额外环境变量，更新时请保留原配置。不要为了升级而删除持久化数据卷。升级前建议备份数据库和 PAC 文件。

## GitHub 仓库维护

- [代码正确性检查](../.github/workflows/check.yml)：按变更范围决定是否执行完整检查。
- [GitHub 配置校验](../.github/workflows/validate-github-config.yml)：检查工作流、Issue 表单及仓库配置的 YAML 语法。
- [构建并发布 Docker 镜像](../.github/workflows/publish-image.yml)
- [清理废弃工作流运行记录](../.github/workflows/cleanup-obsolete-workflow-runs.yml)
- [Dependabot 配置](../.github/dependabot.yml)：每周检查 Bun 依赖和 GitHub Actions 依赖更新。
- [Release 分类配置](../.github/release.yml)：为 GitHub Release 自动生成分类说明。

建议在 GitHub 仓库 Settings 中检查默认分支保护或 Rulesets：要求 Pull Request 合并前通过“代码正确性检查”和“验证 GitHub 配置”两个状态检查，并禁止直接强推。建议 Topics：bun、typescript、vue3、sqlite、docker、pac、proxy、self-hosted。仓库规则和 Topics 需要在 GitHub 设置中启用或编辑；提交配置文件本身不会自动开启分支保护。当前仓库尚未启用 Discussions，因此一般使用问题已提供 Issue 表单；如果希望采用 Discussions，应先在仓库 Settings 中开启。也请检查 Security 设置，确认私密漏洞报告功能已启用。

工作流行为以仓库中的 YAML 文件为准；更新触发条件、发布架构或摘要内容时，应同步检查本页说明。
