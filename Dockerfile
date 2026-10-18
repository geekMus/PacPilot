# 使用 毫秒镜像 Docker Hub 代理获取 Bun 基础镜像。
# 如果该镜像源不可用，请同时修改下面两个 FROM 行中的镜像地址。
# ---------- build ----------
FROM docker.1ms.run/oven/bun:1-alpine AS builder

WORKDIR /app
# 先复制项目 Bun 配置；下面的安装命令会单独指定国内 npm 镜像源。
COPY package.json bun.lockb* bunfig.toml ./
RUN NPM_CONFIG_REGISTRY=https://registry.npmmirror.com bun install --frozen-lockfile || NPM_CONFIG_REGISTRY=https://registry.npmmirror.com bun install

COPY server ./server
COPY client ./client
COPY scripts ./scripts

RUN bun run build:client

# ---------- runtime ----------
FROM docker.1ms.run/oven/bun:1-alpine

# 应用不依赖 curl；避免为时区下载 tzdata，减少 Alpine APK 源这一外部构建依赖。
# POSIX TZ=UTC-8 表示本地时间固定为 UTC+8；APP_TIME_ZONE 保留应用内 IANA 时区名称。
WORKDIR /app
# 运行阶段也使用相同的国内 npm 镜像源。
COPY package.json bun.lockb* bunfig.toml ./
RUN NPM_CONFIG_REGISTRY=https://registry.npmmirror.com bun install --production --frozen-lockfile || NPM_CONFIG_REGISTRY=https://registry.npmmirror.com bun install --production

COPY server ./server
COPY --from=builder /app/dist ./dist

ENV HOST=0.0.0.0 \
    TZ=UTC-8 \
    APP_TIME_ZONE=Asia/Shanghai \
    RUNNING_IN_DOCKER=1 \
    NODE_ENV=production

# 容器内部服务端口固定为 17321。
EXPOSE 17321

# 声明容器数据目录。宿主机是否挂载，由 docker-compose.yml 或启动命令决定。
VOLUME ["/data"]

# 默认进入容器时位于数据目录；应用仍从 /app/server/index.ts 启动。
WORKDIR /data

# 容器只读取 Docker 注入的环境变量，不自动加载 .env 文件。
CMD ["bun", "run", "--no-env-file", "/app/server/index.ts"]
