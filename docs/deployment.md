# 部署指南

## Docker（推荐）

需要 Docker Engine。镜像地址：

```text
ghcr.io/geekmus/genpac-runner:latest
```

创建并启动容器：

```bash
docker run -d \
  --name genpac-runner \
  --restart unless-stopped \
  -p 17321:17321 \
  -v genpac-data:/data \
  ghcr.io/geekmus/genpac-runner:latest
```

然后访问 `http://<服务器地址>:17321/`。

- 容器内服务端口固定为 `17321`。
- `genpac-data` 是 Docker 命名卷，用于持久化 SQLite 数据库、配置、工作流和生成记录，以及 PAC 文件。
- 如果宿主机端口 `17321` 已被占用，可改成 `-p 8080:17321`，并通过 `http://<服务器地址>:8080/` 访问。
- 首次启动会生成随机管理员密码，并在容器日志中输出一次。使用 `docker logs genpac-runner` 查看。
- 新数据库首次启动不会自动生成 PAC。请先登录后台配置生成方式，再手动启动生成。生成前访问 `/proxy.pac` 会返回临时的全量直连脚本，不代表规则已经生效。
- 使用已有数据库重启服务时，会执行一次启动生成工作流。

**重要：** 不要在需要保留数据时删除数据卷，也不要随意执行 `docker volume rm genpac-data`。升级前建议备份数据库和 PAC 文件。

## Docker Compose

仓库提供 [docker-compose.yml](../docker-compose.yml)。默认配置使用预构建镜像，但不会发布宿主机端口，也没有启用数据卷。请按需在 `genpac` 服务下启用端口映射和持久化挂载，再启动：

```bash
docker compose pull
docker compose up -d
docker compose logs -f genpac
```

端口映射示例：

```yaml
ports:
  - "17321:17321"
```

持久化挂载任选一种，不要同时使用：

```yaml
# Docker 命名卷
volumes:
  - genpac-data:/data
```

或者：

```yaml
# 挂载到当前项目目录
volumes:
  - ./data:/data
```

如果使用命名卷，还需要在 Compose 文件顶层声明：

```yaml
volumes:
  genpac-data:
```

## 首次使用

1. 访问 `http://<服务器地址>:17321/` 打开公共状态页。
2. 在容器日志中找到首次启动生成的管理员密码，然后进入后台登录。
3. 在“设置 / 生成配置”中选择生成模式，配置默认代理、远程列表或自定义规则。
4. 保存配置并启动生成，在“工作流”页面查看任务阶段和结果。
5. 确认生成成功后，再把 PAC 地址配置到客户端。

## 常用地址

将 `<服务器地址>:17321` 替换为实际访问地址。如果修改了宿主机端口，请使用映射后的端口。

| 页面或资源 | 地址 |
| --- | --- |
| 公共状态页 | `http://<服务器地址>:17321/` |
| PAC 源码 | `http://<服务器地址>:17321/proxy.pac` |
| 下载 PAC | `http://<服务器地址>:17321/proxy.pac?download=1` |
| 后台总览 | `http://<服务器地址>:17321/admin/dashboard` |
| 生成配置 | `http://<服务器地址>:17321/admin/settings` |
| 网络监控 | `http://<服务器地址>:17321/admin/monitor` |
| 工作流与历史 | `http://<服务器地址>:17321/admin/workflows` |
| 系统设置与维护 | `http://<服务器地址>:17321/admin/system-settings` |

公共状态页与 PAC 地址无需管理员登录。管理后台及管理 API 需要管理员会话。
