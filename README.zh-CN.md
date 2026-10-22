# PacPilot

[English](README.md) | **简体中文**

**PacPilot** 是一个带 Web 管理后台的 PAC 生成与管理服务。它可以根据自定义规则或远程域名列表生成 `proxy.pac`，并提供工作流记录、定时更新、Webhook 通知、请求监控和数据维护功能。

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
  --name pacpilot \
  --restart unless-stopped \
  -p 17321:17321 \
  -v pacpilot-data:/data \
  ghcr.io/geekmus/pacpilot:latest
```

打开 `http://<服务器地址>:17321/`。首次启动会在容器日志中输出一次随机管理员密码：

```bash
docker logs pacpilot
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

## 许可证

本项目采用 **GNU Affero General Public License v3.0（AGPL-3.0）**。

- [许可证英文原文](LICENSE)
- [许可证中文说明（非正式译本）](LICENSE.zh-CN.md)
- [GNU 官方许可证页面](https://www.gnu.org/licenses/agpl-3.0.html)

AGPL-3.0 是强著作权传染（copyleft）开源许可证。除遵守许可证关于复制、修改和分发的要求外，如果修改后的版本通过网络向用户提供交互服务，通常还需要依照第 13 条向这些用户提供获取对应源代码的机会。请阅读许可证全文并根据具体使用方式判断义务。第三方组件仍适用其各自的许可证。

## 社区与贡献

- [贡献指南](CONTRIBUTING.md)：开发环境、测试和 Pull Request 规范。
- [安全政策](SECURITY.md)：私密报告安全漏洞。
- [行为准则](CODE_OF_CONDUCT.md)：项目交流与协作约定。
- [获取帮助](SUPPORT.md)：使用问题、功能建议和授权咨询渠道。
- [提交使用问题](https://github.com/geekMus/PacPilot/issues/new?template=question.yml)：咨询配置、部署和一般使用问题。

提交代码前请阅读贡献指南。安全漏洞不要通过公开 Issue 或讨论披露。

## 项目信息

- 镜像：`ghcr.io/geekmus/pacpilot`
- 默认标签：`latest`
- 当前自动发布工作流构建 `linux/arm64` 镜像。
- 版本号以 `package.json` 的 `version` 为准。

源码、问题反馈与版本记录：[geekMus/PacPilot](https://github.com/geekMus/PacPilot)。
