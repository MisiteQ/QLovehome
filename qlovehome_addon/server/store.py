"""QLovehome Add-on — 数据持久化层.

配置 / 审计日志 / 版本号 —— 全部存数据目录（Supervisor 挂载的 /data），
和 integration 版的接口完全一致，只是 storage_dir 从集成目录改成了 DATA.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

log = logging.getLogger(__name__)

# 数据目录（Supervisor 挂载 /data，本地运行可用环境变量覆盖）
DATA_DIR = Path(os.environ.get("QLH_DATA", "/data"))
CONFIG_FILE = DATA_DIR / "qlh-config.json"
AUDIT_FILE = DATA_DIR / "qlh-audit.log"
AUDIT_MAX_BYTES = 1_000_000
AUDIT_MAX_ENTRIES = 2000

# 版本号：优先读 server/manifest.json（Dockerfile 已 COPY 进容器），
# 开发环境回落到 custom_components/qlovehome/manifest.json，
# 最后兜底硬编码版本。
_VERSION_CACHE: str | None = None


def read_version() -> str:
    global _VERSION_CACHE
    if _VERSION_CACHE:
        return _VERSION_CACHE
    # 按优先级依次尝试：Add-on 容器内的 manifest.json → 开发环境两个位置 → 硬编码兜底
    try:
        here = Path(__file__).resolve().parent
        for candidate in [
            here / "manifest.json",                              # ✅ Dockerfile 已 COPY 到 server/manifest.json
            here.parent.parent / "custom_components" / "qlovehome" / "manifest.json",
            here.parent / "manifest.json",
        ]:
            if candidate.exists():
                data = json.loads(candidate.read_text(encoding="utf-8"))
                v = str(data.get("version", "1.4.1"))
                _VERSION_CACHE = v
                return v
    except (OSError, ValueError):
        pass
    _VERSION_CACHE = "1.4.1"
    return _VERSION_CACHE


# ── 配置文件 ────────────────────────────────────────────────
def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def read_config() -> dict:
    if not CONFIG_FILE.exists():
        return {}
    try:
        data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        log.exception("读取配置失败: %s", CONFIG_FILE)
        return {}


def write_config(data: dict) -> None:
    text = json.dumps(data, ensure_ascii=False, indent=2)
    try:
        _ensure_parent(CONFIG_FILE)
        tmp = CONFIG_FILE.with_suffix(".json.tmp")
        tmp.write_text(text, encoding="utf-8")
        tmp.replace(CONFIG_FILE)
    except OSError:
        log.exception("写入配置失败: %s", CONFIG_FILE)


def read_ui() -> dict:
    ui = read_config().get("ui")
    return ui if isinstance(ui, dict) else {}


def write_ui(ui: dict) -> dict:
    data = read_config()
    merged = data.get("ui")
    merged = merged if isinstance(merged, dict) else {}
    merged.update(ui or {})
    data["ui"] = merged
    write_config(data)
    return merged


def read_timers() -> dict:
    timers = read_config().get("timers")
    return timers if isinstance(timers, dict) else {}


def write_timers(timers: dict) -> dict:
    data = read_config()
    data["timers"] = timers
    write_config(data)
    return timers


def save_config_keep_timers(cfg: dict) -> dict:
    merged = dict(cfg)
    old = read_config().get("timers")
    if isinstance(old, dict) and old:
        merged["timers"] = old
    else:
        merged.pop("timers", None)
    return merged


# ── 审计日志 ────────────────────────────────────────────────
def _audit_rotate() -> None:
    if not AUDIT_FILE.exists():
        return
    try:
        if AUDIT_FILE.stat().st_size >= AUDIT_MAX_BYTES:
            rotated = AUDIT_FILE.with_suffix(AUDIT_FILE.suffix + ".1")
            if rotated.exists():
                rotated.unlink()
            AUDIT_FILE.rename(rotated)
    except OSError:
        log.exception("审计日志轮转失败")


def audit_write(event: str, **detail) -> None:
    _audit_rotate()
    entry: dict = {"time": datetime.now(timezone.utc).isoformat(), "event": event}
    if detail:
        entry.update(detail)
    try:
        _ensure_parent(AUDIT_FILE)
        with AUDIT_FILE.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except OSError:
        log.exception("写入审计日志失败")


def audit_read_recent(limit: int, event: str | None = None) -> list[dict]:
    limit = min(max(limit, 1), AUDIT_MAX_ENTRIES)
    result: list[dict] = []
    for log_file in (AUDIT_FILE, AUDIT_FILE.with_suffix(".log.1")):
        if not log_file.exists():
            continue
        try:
            lines = log_file.read_text(encoding="utf-8").splitlines()
        except OSError:
            continue
        for line in reversed(lines):
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except ValueError:
                continue
            if event and entry.get("event") != event:
                continue
            result.append(entry)
            if len(result) >= limit:
                return result
    return result
