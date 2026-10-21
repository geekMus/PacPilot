# genpac-runner

[![Docker 镜像](https://img.shields.io/badge/GHCR-genpac--runner-blue?logo=docker)](https://github.com/geekMus/genpac-runner/pkgs/container/genpac-runner)
[![GitHub Actions](https://github.com/geekMus/genpac-runner/actions/workflows/publish-image.yml/badge.svg?branch=main)](https://github.com/geekMus/genpac-runner/actions/workflows/publish-image.yml)
[![License](https://img.shields.io/badge/项目-开源代码库-lightgrey?logo=github)](https://github.com/geekMus/genpac-runner)

**genpac-runner** 是一个带 Web 管理后台的 PAC 生成与管理服务。它可以根据自定义规则或远程域名列表生成 `proxy.pac`，并提供工作流记录、定时更新、Webhook 通知、请求监控和数据维护功能。

项目使用 Bun、TypeScript、Vue 3 和 SQLite。部署时直接使用预构建的 Docker 镜像即可，不需要在服务器上克隆源码或安装构建工具。

## 功能

- 自定义规则与远程域名列表两种生成模式。
- PAC 手动生成、保存配置后生成、定时生成及压缩输出。
- 工作流队列、阶段、错误详情与历史记录。
- 生成成功/失败 Webhook 通知，支持自定义 HTTP Webhook 和钉钉机器人。
- 服务请求监控、日志与数据占用查看、日志清理及恢复出厂设置。
- 中文/English 界面，支持系统、浅色和深色主题。

## 快速开始

需要 Docker Engine。拉取并启动：

```bash
docker run -d \
  --name genpac-runner \
  --restart unless-stopped \
  -p 17321:17321 \
  -v genpac-data:/data \
  ghcr.io/geekmus/genpac-runner:latest
```

打开 `http://<服务器地址>:17321/`。首次启动会在容器日志中输出一次随机管理员密码：

```bash
docker logs genpac-runner
```

首次使用新数据库时不会自动生成 PAC。请登录后台配置生成方式并手动启动生成；生成成功后，再将 PAC 地址配置到客户端。

> **数据提醒：** `/data` 保存数据库、配置、工作流记录及 PAC 文件。需要保留数据时，不要删除数据卷；升级前建议先备份。

## 文档

- [文档目录](docs/README.md)
- [部署指南（Docker、Compose、首次使用）](docs/deployment.md)
- [配置说明（规则、环境变量、数据、安全、管理员密码）](docs/configuration.md)
- [开发指南（环境、命令、检查）](docs/development.md)
- [运维与发布（工作流、日志、版本、升级）](docs/operations.md)
- [故障排查](docs/troubleshooting.md)

## 项目信息

- 镜像：`ghcr.io/geekmus/genpac-runner`
- 默认标签：`latest`
- 当前自动发布工作流构建 `linux/arm64` 镜像。
- 版本号以 `package.json` 的 `version` 为准。

源码、问题反馈与版本记录：[geekMus/genpac-runner](https://github.com/geekMus/genpac-runner)。
