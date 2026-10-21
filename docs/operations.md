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

## 工作流文件

- [构建并发布 Docker 镜像](../.github/workflows/publish-image.yml)
- [清理废弃工作流运行记录](../.github/workflows/cleanup-obsolete-workflow-runs.yml)

工作流行为以仓库中的 YAML 文件为准；更新触发条件、发布架构或摘要内容时，应同步检查本页说明。
