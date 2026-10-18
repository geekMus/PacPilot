# 基础镜像可通过 Docker Compose 的 BUN_BASE_IMAGE 构建参数覆盖。
# 默认使用 DaoCloud 的 Docker Hub 镜像代理，便于中国大陆网络环境构建。
ARG BUN_BASE_IMAGE=m.daocloud.io/docker.io/oven/bun:1-alpine

# ---------- build ----------
FROM ${BUN_BASE_IMAGE} AS builder

WORKDIR /app
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile || bun install

COPY server ./server
COPY client ./client
COPY scripts ./scripts
COPY bunfig.toml* ./

RUN bun run build:client

# ---------- runtime ----------
FROM ${BUN_BASE_IMAGE}

RUN apk add --no-cache tzdata curl \
 && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime || true

WORKDIR /app

COPY package.json bun.lockb* ./
RUN bun install --production --frozen-lockfile || bun install --production

COPY server ./server
COPY --from=builder /app/dist ./dist
COPY bunfig.toml* ./

ENV DATA_DIR=/data \
    PORT=17321 \
    HOST=0.0.0.0 \
    TZ=Asia/Shanghai \
    RUNNING_IN_DOCKER=1 \
    NODE_ENV=production

EXPOSE 17321

# 容器只读取 Docker 注入的环境变量，不自动加载 .env 文件。
CMD ["bun", "run", "--no-env-file", "server/index.ts"]
