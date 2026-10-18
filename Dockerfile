# 基于 genpac 官方镜像
FROM docker.1ms.run/jinnlynn/genpac:latest

# 更换基础镜像预设的清华 APK 镜像源，避免源站临时不可达导致 apk 索引下载失败
RUN sed -i 's#https://mirrors.tuna.tsinghua.edu.cn/alpine/#https://dl-cdn.alpinelinux.org/alpine/#g' /etc/apk/repositories \
    && apk add --no-cache curl tzdata python3 py3-pip bash dos2unix \
    && cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime \
    && python3 -m ensurepip

# 复制项目文件
COPY update.sh /update.sh
COPY entrypoint.sh /entrypoint.sh
COPY serve_proxy.py /serve_proxy.py

# 修复换行符并赋予执行权限
RUN dos2unix /entrypoint.sh /update.sh /serve_proxy.py \
    && chmod +x /entrypoint.sh /update.sh /serve_proxy.py

# 设置工作目录
WORKDIR /data

# 容器入口
ENTRYPOINT ["/entrypoint.sh"]
