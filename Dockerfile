# ---------- build ----------
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

VOLUME ["/data"]
EXPOSE 17321

CMD ["bun", "run", "server/index.ts"]
