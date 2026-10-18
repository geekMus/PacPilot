# 使用 DaoCloud 国内 Docker Hub 镜像代理获取 Bun 基础镜像。
# 如果该镜像源不可用，请同时修改下面两个 FROM 行中的镜像地址。
# ---------- build ----------
FROM m.daocloud.io/docker.io/oven/bun:1-alpine AS builder

WORKDIR /app
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile || bun install

COPY server ./server
COPY client ./client
COPY scripts ./scripts
COPY bunfig.toml* ./

RUN bun run build:client

# ---------- runtime ----------
FROM m.daocloud.io/docker.io/oven/bun:1-alpine

RUN apk add --no-cache tzdata curl \
 && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime || true

WORKDIR /app

COPY package.json bun.lockb* ./
RUN bun install --production --frozen-lockfile || bun install --production

COPY server ./server
COPY --from=builder /app/dist ./dist
COPY bunfig.toml* ./

ENV HOST=0.0.0.0 \
    TZ=Asia/Shanghai \
    RUNNING_IN_DOCKER=1 \
    NODE_ENV=production

# 容器内部服务端口固定为 17321。
EXPOSE 17321

# 声明容器数据目录。宿主机是否挂载，由 docker-compose.yml 或启动命令决定。
VOLUME ["/data"]

# 默认进入容器时位于数据目录；应用仍从 /app 启动。
WORKDIR /data

# 容器只读取 Docker 注入的环境变量，不自动加载 .env 文件。
CMD ["bun", "run", "--no-env-file", "/app/server/index.ts"]
