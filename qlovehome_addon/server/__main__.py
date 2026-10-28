"""QLovehome Add-on — 入口.

运行方式:
    python -m server          # 默认 0.0.0.0:8765
    QLH_PORT=9000 python -m server
"""

import asyncio
import logging
import os

from aiohttp import web

from .app import create_app

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("qlovehome")


def main() -> None:
    host = os.environ.get("QLH_HOST", "0.0.0.0")
    port = int(os.environ.get("QLH_PORT", "8765"))
    app = create_app()
    log.info("QLovehome Add-on 启动: http://%s:%s", host, port)
    web.run_app(app, host=host, port=port, print=None)


if __name__ == "__main__":
    main()
