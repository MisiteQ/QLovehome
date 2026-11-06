# QLovehome HAOS Add-on
# 构建方式：HA Supervisor 官方构建器会按架构替换 {arch}（amd64 / aarch64）
# 基础镜像跟随 Alpine 版本：3.22 与当前 Home Assistant Core 2026.x 一致
ARG BUILD_FROM=ghcr.io/home-assistant/{arch}-base:3.22

FROM ${BUILD_FROM}

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    QLH_HOST=0.0.0.0 \
    QLH_PORT=8765 \
    QLH_DATA=/data \
    QLH_STATIC=/app/www \
    QLH_ALLOW_DIRECT=0

# Alpine 预编译包：aiohttp（HTTP/WebSocket）
RUN apk add --no-cache python3 py3-aiohttp

EXPOSE 8765

WORKDIR /app

COPY server/ /app/server/
COPY www/ /app/www/
COPY run.sh /
RUN chmod a+x /run.sh

CMD ["/run.sh"]
