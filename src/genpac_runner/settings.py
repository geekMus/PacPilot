"""Configuration defaults and validation for the web-managed settings."""
import json
import re
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DEFAULTS = {
    "startup_mode": "custom",
    "pac_proxy": "SOCKS5 192.168.31.200:7893; DIRECT",
    "gfwlist_url": "https://github.com/gfwlist/gfwlist/raw/master/gfwlist.txt",
    "pac_compress": "false",
    "pac_precise": "false",
    "block_list": "",
    "direct_list": "",
    "cron_schedule": "",
    "timezone": "Asia/Shanghai",
    "webhook_success_url": "",
    "webhook_success_options": json.dumps(
        {"msgtype": "markdown", "markdown": {"title": "genpac-runner", "text": "✅ PAC 更新成功"}},
        ensure_ascii=False,
        indent=2,
    ),
    "webhook_failure_url": "",
    "webhook_failure_options": json.dumps(
        {"msgtype": "markdown", "markdown": {"title": "genpac-runner", "text": "❌ PAC 更新失败"}},
        ensure_ascii=False,
        indent=2,
    ),
}


def as_bool(value):
    return str(value).strip().lower() in ("1", "true", "yes", "on")


def normalize_domain_list(value):
    entries = []
    seen = set()
    for line in str(value or "").replace(",", "\n").splitlines():
        rule = line.strip()
        if not rule:
            continue
        if len(rule) > 253 or not re.fullmatch(r"[A-Za-z0-9*._-]+", rule):
            raise ValueError("域名规则包含不支持的字符：" + rule[:80])
        key = rule.lower()
        if key not in seen:
            entries.append(rule)
            seen.add(key)
    return "\n".join(entries)


def _cron_field_values(field, low, high, sunday=False):
    if not field or not re.fullmatch(r"[0-9*/,-]+", field):
        raise ValueError("定时任务格式错误：请使用标准的 5 段 cron 表达式。")
    values = set()
    for part in field.split(","):
        if not part:
            raise ValueError("定时任务表达式含空项。")
        base, slash, step_text = part.partition("/")
        step = int(step_text) if slash else 1
        if step < 1:
            raise ValueError("定时任务步长必须大于 0。")
        if base == "*":
            start, end = low, high
        elif "-" in base:
            bounds = base.split("-", 1)
            if not bounds[0] or not bounds[1]:
                raise ValueError("定时任务范围格式错误。")
            start, end = int(bounds[0]), int(bounds[1])
        else:
            start = int(base)
            end = high if slash else start
        if start < low or end > high or start > end:
            raise ValueError("定时任务字段超出允许范围。")
        values.update(range(start, end + 1, step))
    if sunday and 7 in values:
        values.add(0)
        values.discard(7)
    return values


def validate_cron(schedule):
    schedule = str(schedule or "").strip()
    if not schedule:
        return ""
    parts = schedule.split()
    if len(parts) != 5:
        raise ValueError("Cron 必须是 5 段格式：分 时 日 月 周；留空则关闭定时更新。")
    _cron_field_values(parts[0], 0, 59)
    _cron_field_values(parts[1], 0, 23)
    _cron_field_values(parts[2], 1, 31)
    _cron_field_values(parts[3], 1, 12)
    _cron_field_values(parts[4], 0, 7, sunday=True)
    return " ".join(parts)


def validate_settings(form, current):
    """Validate submitted form fields and return a complete settings dictionary."""
    result = dict(DEFAULTS)
    result.update(current or {})

    mode = str(form.get("startup_mode", result["startup_mode"])).strip()
    if mode not in ("custom", "genpac"):
        raise ValueError("启动模式无效。")
    result["startup_mode"] = mode

    proxy = str(form.get("pac_proxy", result["pac_proxy"])).strip()
    proxy_part = r"[A-Za-z0-9][A-Za-z0-9 .:/\[\]_-]*"
    if not proxy or len(proxy) > 512 or not re.fullmatch(
        proxy_part + r"(?:\s*;\s*" + proxy_part + r")*", proxy
    ):
        raise ValueError(
            "代理规则为空或包含不支持的字符。示例：SOCKS5 192.168.31.200:7893; DIRECT"
        )
    result["pac_proxy"] = proxy

    gfwlist_url = str(form.get("gfwlist_url", result["gfwlist_url"])).strip()
    if len(gfwlist_url) > 2048:
        raise ValueError("GFWList 地址太长。")
    if mode == "genpac":
        parsed = urlsplit(gfwlist_url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            raise ValueError("genpac 模式需要填写有效的 HTTP 或 HTTPS GFWList 地址。")
    elif gfwlist_url:
        parsed = urlsplit(gfwlist_url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            raise ValueError("GFWList 地址必须是有效的 HTTP 或 HTTPS URL。")
    result["gfwlist_url"] = gfwlist_url

    result["pac_compress"] = "true" if form.get("pac_compress") else "false"
    result["pac_precise"] = "true" if form.get("pac_precise") else "false"
    result["block_list"] = normalize_domain_list(form.get("block_list", result["block_list"]))
    result["direct_list"] = normalize_domain_list(form.get("direct_list", result["direct_list"]))
    result["cron_schedule"] = validate_cron(form.get("cron_schedule", result["cron_schedule"]))

    timezone_name = str(form.get("timezone", result["timezone"])).strip()
    try:
        ZoneInfo(timezone_name)
    except (ZoneInfoNotFoundError, ValueError):
        raise ValueError("时区无效，请填写 IANA 时区名称，例如 Asia/Shanghai 或 UTC。")
    result["timezone"] = timezone_name

    for kind in ("success", "failure"):
        url_key = "webhook_" + kind + "_url"
        options_key = "webhook_" + kind + "_options"
        url_value = str(form.get(url_key, "")).strip()
        if url_value:
            parsed = urlsplit(url_value)
            if parsed.scheme not in ("http", "https") or not parsed.hostname:
                raise ValueError(kind + " Webhook 地址必须以 http:// 或 https:// 开头。")
        if len(url_value) > 2048:
            raise ValueError(kind + " Webhook 地址太长。")

        options_value = str(form.get(options_key, "")).strip() or DEFAULTS[options_key]
        if len(options_value) > 32768:
            raise ValueError(kind + " Webhook JSON 配置太大。")
        try:
            payload = json.loads(options_value)
        except json.JSONDecodeError as error:
            raise ValueError(kind + " Webhook 配置不是有效 JSON：" + str(error))
        if not isinstance(payload, dict):
            raise ValueError(kind + " Webhook JSON 顶层必须是对象。")
        result[url_key] = url_value
        result[options_key] = json.dumps(payload, ensure_ascii=False, indent=2)

    return result
