# 使用官方 Bun Alpine 镜像和默认软件源，保持标准构建流程。
# ---------- 构建阶段 ----------
FROM oven/bun:1-alpine AS builder

WORKDIR /app
# 先复制依赖清单，使用 Bun 默认的官方 npm registry。
COPY package.json bun.lockb* bunfig.toml ./
RUN echo "正在安装构建阶段依赖……" \
 && (bun install --frozen-lockfile || bun install)

COPY server ./server
COPY client ./client
COPY scripts ./scripts

RUN echo "正在编译前端资源……" && bun run build:client

# ---------- 运行阶段 ----------
FROM oven/bun:1-alpine

# 安装 IANA 时区数据库，使 TZ=Asia/Shanghai、TZ=Etc/UTC 等时区名称可用。
RUN echo "正在安装时区数据库……" && apk add --no-cache tzdata

WORKDIR /app
# 运行阶段也使用 Bun 默认的官方 npm registry。
COPY package.json bun.lockb* bunfig.toml ./
RUN echo "正在安装运行阶段依赖……" \
 && (bun install --production --frozen-lockfile || bun install --production)

COPY server ./server
COPY --from=builder /app/dist ./dist

ENV HOST=0.0.0.0 \
    TZ=Asia/Shanghai \
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
