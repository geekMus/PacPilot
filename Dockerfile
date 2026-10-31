# 构建阶段使用官方 Bun Debian(glibc) 镜像，避免 vite/rollup/esbuild 等原生绑定
# 在 Alpine(musl) 下加载崩溃或缺失；运行阶段仍用 Alpine 保持小体积。
# 两阶段都钉在 1.4 大版本：1.4 起换用 mimalloc 分配器与新 scavenger，
# 稳态内存显著低于 1.3（官方基准 76MB -> 53MB），且不再接受 1.3 的回退。
# ---------- 构建阶段 ----------
FROM --platform=$BUILDPLATFORM oven/bun:1.4 AS builder

WORKDIR /app
COPY package.json bunfig.toml bun.lock ./
RUN echo "正在按锁文件安装构建阶段依赖……" \
 && bun install --frozen-lockfile

# 完整复制项目源码；由 .dockerignore 排除本机依赖、数据和构建产物。
COPY . .

# 类型检查已由 CI 的 check job 在原生平台完成（并以 check 成功 gate 发布），
# 镜像内重复执行 typecheck 冗余，且会因冻结锁文件解析差异导致构建失败；这里只编译前端。
RUN echo "正在编译前端资源……" && bun run build:client

# ---------- 运行阶段 ----------
FROM oven/bun:1.4-alpine

# 安装 IANA 时区数据库，使 TZ=Asia/Shanghai、TZ=Etc/UTC 等时区名称可用。
RUN echo "正在安装时区数据库……" && apk add --no-cache tzdata

WORKDIR /app
# 运行阶段也使用 Bun 默认的官方 npm registry。
COPY package.json bunfig.toml ./
# 复用提交到构建阶段的锁文件，确保生产依赖与前端/类型检查使用的解析版本一致。
COPY --from=builder /app/bun.lock ./bun.lock
RUN echo "正在按构建锁文件安装运行阶段依赖（不执行开发生命周期脚本）……" \
 && bun install --production --frozen-lockfile --ignore-scripts

# 运行镜像保留完整项目源码，避免遗漏服务端运行时导入的共享模块。
COPY . .
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
