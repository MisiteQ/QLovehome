#!/usr/bin/with-contenv bashio
# SUPERVISOR_TOKEN 由 Supervisor 注入，后端自动检测并连接 http://supervisor/core

bashio::log.info "启动 QLovehome Add-on（Ingress 端口 8765，数据目录 /data）"

mkdir -p /data

cd /app
exec python3 -m server
