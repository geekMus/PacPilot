# ---------- build（用 Bun 装依赖并构建 Vue 前端） ----------
FROM oven/bun:1-alpine AS builder

WORKDIR /app
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile || bun install

COPY server ./server
COPY client ./client
COPY scripts ./scripts
COPY bunfig.toml* ./

RUN bun run build:client

# ---------- runtime ----------
FROM oven/bun:1-alpine

# genpac 仍依赖 Python CLI
RUN apk add --no-cache python3 py3-pip tzdata curl \
 && pip3 install --no-cache-dir --break-system-packages genpac \
 || pip3 install --no-cache-dir genpac \
 && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime || true

WORKDIR /app

COPY package.json bun.lockb* ./
RUN bun install --production --frozen-lockfile || bun install --production

COPY server ./server
COPY --from=builder /app/dist ./dist
COPY bunfig.toml* ./

ENV DATA_DIR=/data \
    PORT=8080 \
    TZ=Asia/Shanghai \
    NODE_ENV=production

VOLUME ["/data"]
EXPOSE 8080

# 生产环境直接用 Bun 跑 TypeScript 入口
CMD ["bun", "run", "server/index.ts"]
