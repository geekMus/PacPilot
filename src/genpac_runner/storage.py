"""SQLite persistence for settings and PAC update history."""
from contextlib import closing
from pathlib import Path
import sqlite3

from .settings import DEFAULTS

DATA_DIR = Path("/data")
DB_PATH = DATA_DIR / "config.sqlite3"


def _connect():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(DB_PATH), timeout=15)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA busy_timeout = 15000")
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize():
    """Create database schema and fill in missing default keys without overwriting saved values."""
    with closing(_connect()) as db:
        db.execute("PRAGMA journal_mode = WAL")
        db.execute(
            "CREATE TABLE IF NOT EXISTS settings ("
            "key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)"
        )
        db.execute(
            "CREATE TABLE IF NOT EXISTS update_history ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT,"
            "created_at TEXT NOT NULL,"
            "status TEXT NOT NULL CHECK(status IN ('success', 'failure')),"
            "details TEXT NOT NULL)"
        )
        with db:
            db.executemany(
                "INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)",
                [(key, str(value)) for key, value in DEFAULTS.items()],
            )


def get_settings():
    initialize()
    with closing(_connect()) as db:
        rows = db.execute("SELECT key, value FROM settings").fetchall()
    values = dict(DEFAULTS)
    values.update({row["key"]: row["value"] for row in rows})
    return values


def save_settings(values):
    """Persist validated values atomically."""
    initialize()
    with closing(_connect()) as db:
        with db:
            db.executemany(
                "INSERT INTO settings(key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                [(key, str(values[key])) for key in DEFAULTS],
            )
    return get_settings()


def record_update(status, details):
    initialize()
    from datetime import datetime
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

    settings = get_settings()
    try:
        now = datetime.now(ZoneInfo(settings.get("timezone", "Asia/Shanghai")))
    except (ZoneInfoNotFoundError, ValueError):
        now = datetime.now().astimezone()
    with closing(_connect()) as db:
        with db:
            db.execute(
                "INSERT INTO update_history(created_at, status, details) VALUES (?, ?, ?)",
                (now.isoformat(timespec="seconds"), status, str(details)[:5000]),
            )
            db.execute(
                "DELETE FROM update_history WHERE id NOT IN "
                "(SELECT id FROM update_history ORDER BY id DESC LIMIT 50)"
            )


def recent_updates(limit=10):
    initialize()
    limit = max(1, min(50, int(limit)))
    with closing(_connect()) as db:
        rows = db.execute(
            "SELECT created_at, status, details FROM update_history "
            "ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [dict(row) for row in rows]
