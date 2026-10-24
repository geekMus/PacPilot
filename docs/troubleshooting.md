# 故障排查

## 无法访问网页

- 确认容器正在运行：`docker ps`
- 确认已发布端口：`docker port pacpilot`
- 查看服务日志：`docker logs --tail 200 pacpilot`
- 检查宿主机防火墙、反向代理和端口映射。
- 确认访问的宿主机端口与 Docker 的端口映射一致。

## 管理员无法登录

- 查看首次启动日志中的随机密码：`docker logs pacpilot`。
- 若密码遗失，按[配置说明中的管理员密码重置步骤](configuration.md#管理员密码重置)重置。
- 确认重置脚本使用的是服务实际使用的数据目录。

## PAC 仍是全量直连

- PAC 由内存实时渲染，保存配置后立即生效，不需要手动点击生成。
- 检查代理字符串、自定义规则是否已保存到后台设置。
- 远程规则模式下，若从未成功拉取过规则，`/pac` 会返回全量直连脚本。保存一次设置（或触发定时任务）以拉取规则。
- 响应头 `X-Pac-Cache` 为 `fallback` 表示本次渲染失败，查看容器日志中的 `PAC rendering failed` 定位原因。
- 修改设置后仍无变化时，确认反向代理/CDN 没有缓存 `/pac`；服务端返回 `Cache-Control: no-cache`，但中间层可能覆盖。

## 改了远程规则但 PAC 没有更新

- 远程规则**不会自动轮询**。刷新只在两种时机发生：保存设置时，以及定时任务触发时。
- 检查“定时任务”是否配置了 cron 表达式；未配置则永远不会自动刷新。
- 定时任务刷新失败会记录 `Scheduled remote rule refresh failed`，确认远程 URL 可访问。
- 可在系统设置页手动清空 PAC 缓存后重新保存设置以强制刷新。

## 远程列表生成失败

- 确认容器能够访问配置的 URL。
- 确认内容属于支持的列表格式：GFWList（Base64）、域名型 AutoProxy / ABP，或每行一个域名的纯文本列表。
- 该功能不是完整的 ABP 规则引擎，复杂过滤表达式可能不会按原意处理。

## 升级后配置丢失

- 检查容器是否始终挂载到同一个持久化卷或数据目录。
- 没有挂载 `/data` 时，删除容器可能导致应用数据丢失。
- 不要在需要保留数据时删除 Docker 命名卷；升级前请备份数据库和 PAC 文件。

## 跨域管理 API 请求失败

- 默认不开放跨域浏览器访问管理 API（`CORS_MODE=strict`）。
- **同站子域**（如 `app.example.com` 调 `api.example.com`）走 Cookie：把前端来源加进 `CORS_ALLOWED_ORIGINS`。
- **独立静态前端**（Cloudflare Pages / Vercel 等任意源）走令牌：设置 `CORS_MODE=open`，并确认前端 `config.json` 的 `apiBaseUrl` 指向后端；预检响应应含 `Access-Control-Allow-Origin: *`。
- `open` 模式下浏览器请求不能带凭据，前端会自动使用 `credentials: "omit"` 并携带 `Authorization`。若手动联调，请勿同时发送 Cookie。
- 检查 Origin 是否完整匹配白名单中的来源，且不要使用通配符。
- 参考[配置说明中的跨域与访问安全](configuration.md#跨域与访问安全)。

## 登录返回 403 `untrusted_origin`

- 出现在 `CORS_MODE=strict`：管理写请求的 Origin 不在白名单内。
- 把前端来源加入 `CORS_ALLOWED_ORIGINS`，或改用 `CORS_MODE=open`（纯静态前端场景）。

## 访问日志里的 IP 是 172.x / 127.0.0.1

- 说明请求经过反向代理或 Cloudflare Tunnel，但应用没有读取转发头。
- 配置 `TRUSTED_PROXY_CIDRS` 为代理所在网段（`docker network inspect` 确认）。
- 走 Cloudflare Tunnel 时再加上 `TRUST_CLOUDFLARE_IP=1`；只写该项而不写 `TRUSTED_PROXY_CIDRS` 会导致启动失败。
- 反向代理层数与 `TRUST_PROXY_HOPS` 不一致时，取到的是中间跳的地址。

## 修改 `DEFAULT_ADMIN_PASSWORD` 后密码没有变化

- 该变量只在**数据库尚无管理员凭据**时生效。重新部署不会重置已有密码。
- 需要重置请使用[管理员密码重置](configuration.md#管理员密码重置)中的脚本。
