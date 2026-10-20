# 使用官方 Bun Alpine 镜像和默认软件源，保持标准构建流程。
# ---------- 构建阶段 ----------
FROM --platform=$BUILDPLATFORM oven/bun:1-alpine AS builder

WORKDIR /app
# 先复制依赖清单，使用 Bun 默认的官方 npm registry。
COPY package.json bunfig.toml ./
RUN echo "正在安装构建阶段依赖并生成本次构建锁文件……" \
 && bun install

COPY tsconfig.json ./
COPY server ./server
COPY client ./client
COPY scripts ./scripts
COPY shared ./shared

RUN echo "正在检查 TypeScript 类型并编译前端资源……" && bun run typecheck && bun run build:client

# ---------- 运行阶段 ----------
FROM oven/bun:1-alpine

# 安装 IANA 时区数据库，使 TZ=Asia/Shanghai、TZ=Etc/UTC 等时区名称可用。
RUN echo "正在安装时区数据库……" && apk add --no-cache tzdata

WORKDIR /app
# 运行阶段也使用 Bun 默认的官方 npm registry。
COPY package.json bunfig.toml ./
# 复用构建阶段生成的锁文件，确保生产依赖与前端/类型检查使用的解析版本一致。
COPY --from=builder /app/bun.lock ./bun.lock
RUN echo "正在按构建锁文件安装运行阶段依赖……" \
 && bun install --production --frozen-lockfile

COPY server ./server
COPY scripts ./scripts
COPY --from=builder /app/dist ./dist

ENV HOST=0.0.0.0 \
    RUNNING_IN_DOCKER=1 \
    NODE_ENV=production

# 容器内部服务端口固定为 17321。
EXPOSE 17321

# 默认进入容器时位于数据目录；应用仍从 /app/server/index.ts 启动。
WORKDIR /data

# 容器只读取 Docker 注入的环境变量，不自动加载 .env 文件。
CMD ["bun", "run", "--no-env-file", "/app/server/index.ts"]
