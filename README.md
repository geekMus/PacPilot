# genpac-runner

一个基于 Docker 的 **自动生成 PAC 文件** 工具，支持 GFWList、SOCKS5/DIRECT 代理规则，并可通过 Webhook 通知成功或失败。

---

## 功能

- 自动生成 PAC 文件 (`proxy.pac`)
- 支持 GFWList URL 配置
- 支持 SOCKS5 或 HTTP 代理规则
- 支持 PAC 压缩和精确模式
- 支持 Webhook 成功/失败通知（钉钉示例）
- 内置 HTTP 服务，提供 `/proxy.pac` 和 `/status` 两个路由；PAC 原文以 UTF-8 显示，状态页展示当前生成文件中的直连、黑名单和默认代理范围
- 支持定时任务（Cron）自动更新 PAC 文件

---

## 文件说明

| 文件 | 功能 |
|------|------|
| `Dockerfile` | Docker 构建文件，安装依赖并复制脚本 |
| `docker-compose.yml` | Docker Compose 配置，设置环境变量和端口 |
| `entrypoint.sh` | 容器入口脚本，初始化时区、生成 PAC、启动 cron 和 HTTP 服务 |
| `update.sh` | 自动生成 PAC 的脚本，并触发 webhook |
| `serve_proxy.py` | 内置 HTTP 服务，提供 `/proxy.pac` 和 `/status` 规则状态页 |

---

## 路由

| 路径 | 说明 |
|------|------|
| `/proxy.pac` | 返回当前生成的 PAC 文件 |
| `/status` | PAC 规则状态页：在自定义规则模式下列出直连和黑名单规则，并说明未命中时的默认代理；若当前文件为 genpac 等其他格式，则提示自定义列表不一定生效 |
| `/` | 保持兼容，重定向至 `/proxy.pac` |

状态页读取 `/data/proxy.pac` 当前内容，不会把未注入 PAC 的环境变量列表误报为生效规则。修改规则后刷新页面即可查看最新生成结果。

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `CRON_SCHEDULE` | - | cron 表达式，控制 PAC 更新频率 |
| `TZ` | `Asia/Shanghai` | 容器时区 |
| `PAC_PROXY` | `SOCKS5 127.0.0.1:1080; DIRECT` | PAC 代理规则 |
| `PAC_COMPRESS` | `true` | 是否压缩 PAC 文件 |
| `PAC_PRECISE` | `false` | 是否精确模式 |
| `GFWLIST_URL` | `https://github.com/gfwlist/gfwlist/raw/master/gfwlist.txt` | GFWList 地址 |
| `WEBHOOK_SUCCESS_URL` | - | 成功 webhook URL，可选 |
| `WEBHOOK_SUCCESS_OPTIONS` | - | 成功 webhook JSON 配置，可选 |
| `WEBHOOK_FAILURE_URL` | - | 失败 webhook URL，可选 |
| `WEBHOOK_FAILURE_OPTIONS` | - | 失败 webhook JSON 配置，可选 |
| `PAC_BLOCK_LIST` | [] | 黑名单（以,分割） |
| `PAC_DIRECT_LIST` | [] | 直连列表 |

---

## 构建与运行

### 1. 构建镜像

```bash
docker-compose build
```

### 2. 部署并启动

将仓库放到 dpanel 下的 compose 目录，然后直接在面板启动即可
