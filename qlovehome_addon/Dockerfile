# QLovehome HAOS Add-on
# 构建方式：HA Supervisor 官方构建器按架构注入 BUILD_FROM
ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:3.20

FROM ${BUILD_FROM}

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    QLH_HOST=0.0.0.0 \
    QLH_PORT=8765 \
    QLH_DATA=/data \
    QLH_STATIC=/app/www

# Alpine 预编译包：aiohttp（HTTP/WebSocket）
RUN apk add --no-cache python3 py3-aiohttp

WORKDIR /app

COPY server/ /app/server/
COPY www/ /app/www/
COPY run.sh /
RUN chmod a+x /run.sh

CMD ["/run.sh"]
