"""Database-driven scheduled PAC refreshes."""
from datetime import datetime
import threading
import time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .pac import generate_pac
from .settings import _cron_field_values
from .storage import get_settings


def cron_matches(schedule, now):
    parts = str(schedule or "").split()
    if len(parts) != 5:
        return False
    try:
        minutes = _cron_field_values(parts[0], 0, 59)
        hours = _cron_field_values(parts[1], 0, 23)
        days = _cron_field_values(parts[2], 1, 31)
        months = _cron_field_values(parts[3], 1, 12)
        weekdays = _cron_field_values(parts[4], 0, 7, sunday=True)
    except (ValueError, TypeError):
        return False

    if now.minute not in minutes or now.hour not in hours or now.month not in months:
        return False

    day_match = now.day in days
    # Cron weekday: Sunday=0 (also accepts 7).
    weekday_match = ((now.weekday() + 1) % 7) in weekdays
    day_unrestricted = parts[2] == "*"
    weekday_unrestricted = parts[4] == "*"

    if day_unrestricted and weekday_unrestricted:
        return True
    if day_unrestricted:
        return weekday_match
    if weekday_unrestricted:
        return day_match
    return day_match or weekday_match


def scheduler_loop(stop_event=None, interval=10):
    """Poll the saved schedule; setting changes apply without container recreation."""
    stop_event = stop_event or threading.Event()
    last_minute = None
    while not stop_event.is_set():
        try:
            settings = get_settings()
            zone = ZoneInfo(settings.get("timezone", "Asia/Shanghai"))
            now = datetime.now(zone)
            minute_key = now.strftime("%Y%m%d%H%M")
            if minute_key != last_minute:
                if last_minute is not None and settings.get("cron_schedule") and cron_matches(
                    settings["cron_schedule"], now
                ):
                    try:
                        generate_pac()
                    except Exception as error:
                        print("[scheduler] PAC 更新失败：%s" % error, flush=True)
                last_minute = minute_key
        except (ZoneInfoNotFoundError, ValueError) as error:
            print("[scheduler] 时区或调度配置错误：%s" % error, flush=True)
        except Exception as error:
            print("[scheduler] 调度检查失败：%s" % error, flush=True)
        stop_event.wait(interval)
