"""HTML rendering helpers backed by external templates and static assets."""
from datetime import datetime
from html import escape
import json
from pathlib import Path
import re

from .settings import DEFAULTS
from .storage import get_settings, recent_updates
from .pac import PAC_PATH

PACKAGE_DIR = Path(__file__).resolve().parent
TEMPLATE_DIR = PACKAGE_DIR / "templates"
STATIC_DIR = PACKAGE_DIR / "static"


def render_template(name, context):
    html = (TEMPLATE_DIR / name).read_text(encoding="utf-8")
    for key, value in context.items():
        html = html.replace("{{" + key + "}}", str(value))
    return html


def _e(value):
    return escape(str(value if value is not None else ""), quote=True)


def render_login(csrf, error=False):
    error_html = (
        '<div class="notice error">密码不正确或登录验证已过期，请重试。</div>'
        if error else ""
    )
    return render_template(
        "login.html",
        {"LOGIN_CSRF": _e(csrf), "ERROR_HTML": error_html},
    )


def _history_rows():
    rows = recent_updates(10)
    if not rows:
        return '<tr><td colspan="3" class="muted">暂无生成记录。</td></tr>'
    rendered = []
    for row in rows:
        success = row["status"] == "success"
        label = "成功" if success else "失败"
        css = "status-ok" if success else "status-fail"
        rendered.append(
            "<tr><td>" + _e(row["created_at"]) + "</td><td class=\"" + css + "\">"
            + label + "</td><td>" + _e(row["details"]) + "</td></tr>"
        )
    return "\n".join(rendered)


def _pretty_json(value):
    try:
        return json.dumps(json.loads(value), ensure_ascii=False, indent=2)
    except (ValueError, TypeError):
        return str(value)


def render_admin(csrf, message="", error="", submitted=None):
    settings = get_settings()
    submitted = submitted or {}

    def value(key):
        return submitted.get(key, settings.get(key, DEFAULTS.get(key, "")))

    def checked(key):
        if key in submitted:
            return 'checked' if submitted[key] in ("1", "true", "on") else ""
        return 'checked' if str(value(key)).lower() in ("1", "true", "on") else ""

    def selected(key, expected):
        return 'selected' if value(key) == expected else ""

    message_html = '<div class="notice ok">' + _e(message) + '</div>' if message else ""
    error_html = '<div class="notice error">' + _e(error) + '</div>' if error else ""

    context = {
        "CSRF": _e(csrf),
        "MESSAGE_HTML": message_html,
        "ERROR_HTML": error_html,
        "MODE_CUSTOM_SELECTED": selected("startup_mode", "custom"),
        "MODE_GENPAC_SELECTED": selected("startup_mode", "genpac"),
        "PAC_PROXY": _e(value("pac_proxy")),
        "GFWLIST_URL": _e(value("gfwlist_url")),
        "PAC_COMPRESS_CHECKED": checked("pac_compress"),
        "PAC_PRECISE_CHECKED": checked("pac_precise"),
        "DIRECT_LIST": _e(value("direct_list")),
        "BLOCK_LIST": _e(value("block_list")),
        "CRON_SCHEDULE": _e(value("cron_schedule")),
        "TIMEZONE": _e(value("timezone")),
        "WEBHOOK_SUCCESS_URL": _e(value("webhook_success_url")),
        "WEBHOOK_SUCCESS_OPTIONS": _e(_pretty_json(value("webhook_success_options"))),
        "WEBHOOK_FAILURE_URL": _e(value("webhook_failure_url")),
        "WEBHOOK_FAILURE_OPTIONS": _e(_pretty_json(value("webhook_failure_options"))),
        "HISTORY_ROWS": _history_rows(),
    }
    return render_template("admin.html", context)


def _parse_js_array(source, name):
    match = re.search(
        r"\bvar\s+" + re.escape(name) + r"\s*=\s*(\[[^;]*\])\s*;",
        source,
        re.DOTALL,
    )
    if not match:
        return None
    try:
        value = json.loads(match.group(1))
    except (TypeError, ValueError):
        return None
    return value if isinstance(value, list) and all(isinstance(item, str) for item in value) else None


def _parse_js_string(source, name):
    match = re.search(
        r"\bvar\s+" + re.escape(name) + r'\s*=\s*("(?:\\.|[^"\\])*")\s*;',
        source,
    )
    if not match:
        return None
    try:
        value = json.loads(match.group(1))
    except (TypeError, ValueError):
        return None
    return value if isinstance(value, str) else None


def _rule_panel(title, eyebrow, rules, empty_text, description):
    rows = []
    for rule in rules:
        rows.append(
            '<li class="rule-item" data-rule="' + _e(rule).lower() + '">'
            '<code>' + _e(rule) + '</code>'
            '<span class="rule-desc">' + (
                "按通配符模式匹配" if "*" in rule else "根域名及所有层级子域名"
            ) + '</span></li>'
        )
    if not rows:
        rows.append('<li class="empty-state">' + _e(empty_text) + '</li>')
    return (
        '<section class="panel"><div class="panel-head"><div><span class="eyebrow">'
        + _e(eyebrow) + '</span><h2>' + _e(title) + '</h2></div><span class="count">'
        + str(len(rules)) + ' 条</span></div><p class="muted">'
        + _e(description) + '</p><ul class="rule-list">' + "".join(rows) + '</ul></section>'
    )


def render_status(admin_enabled=False):
    try:
        pac = PAC_PATH.read_text(encoding="utf-8")
    except OSError:
        pac = ""

    mode = "当前尚未生成 PAC"
    stats_html = (
        '<div class="stat"><span>当前文件</span><strong>不存在</strong></div>'
        '<div class="stat"><span>生成模式</span><strong>未生成</strong></div>'
        '<div class="stat"><span>最后更新</span><strong>—</strong></div>'
    )
    rules_html = ""
    notice_html = '<div class="notice error">未找到 proxy.pac。请进入后台保存设置并生成 PAC，或查看容器日志排查启动错误。</div>'
    if pac:
        if "User defined PAC (no genpac)" in pac:
            block_list = _parse_js_array(pac, "BLOCK_LIST")
            direct_list = _parse_js_array(pac, "DIRECT_LIST")
            proxy = _parse_js_string(pac, "PAC_PROXY")
            if block_list is None or direct_list is None or proxy is None:
                mode = "自定义 PAC（解析异常）"
                notice_html = '<div class="notice error">检测到自定义 PAC 标记，但无法解析规则变量。请检查生成文件。</div>'
            else:
                mode = "自定义 PAC"
                stats_html = (
                    '<div class="stat"><span>直连规则</span><strong>' + str(len(direct_list)) + '</strong></div>'
                    '<div class="stat"><span>黑名单规则</span><strong>' + str(len(block_list)) + '</strong></div>'
                    '<div class="stat"><span>默认策略</span><strong>' + _e(proxy) + '</strong></div>'
                )
                rules_html = _rule_panel(
                    "直连规则", "DIRECT", direct_list, "没有配置额外的直连域名。",
                    "匹配后直接连接，不经过代理。"
                ) + _rule_panel(
                    "黑名单 / 拦截规则", "BLOCK", block_list, "没有配置黑名单规则。",
                    "命中时 PAC 返回 PROXY 0.0.0.0:0；这属于无效代理拦截尝试，不是防火墙级阻断。"
                )
                notice_html = (
                    '<div class="notice"><strong>默认策略</strong>未命中内网 / 本地直连、黑名单或直连列表的主机，'
                    '会返回 <code>' + _e(proxy) + '</code>。包含 <code>; DIRECT</code> 时，浏览器在代理不可用时可能回退直连。</div>'
                )
        else:
            mode = "genpac / GFWList 生成模式或其他 PAC"
            stats_html = (
                '<div class="stat"><span>当前文件</span><strong>已生成</strong></div>'
                '<div class="stat"><span>规则来源</span><strong>当前 PAC</strong></div>'
                '<div class="stat"><span>自定义列表</span><strong>未注入</strong></div>'
            )
            notice_html = (
                '<div class="notice">当前文件不包含自定义 PAC 模板标记，无法可靠地从中提取完整的域名规则。'
                '在 genpac 模式下，本项目的直连和黑名单列表会保留在 SQLite 中，但不会自动注入 genpac 生成结果。'
                '请查看 <a href="/proxy.pac">当前 PAC 原文</a> 检查实际规则。</div>'
            )

    admin_link = '<a href="/admin">后台管理 ↗</a>' if admin_enabled else ""
    return render_template(
        "status.html",
        {
            "ADMIN_LINK": admin_link,
            "STATUS_MODE": _e(mode),
            "STATS_HTML": stats_html,
            "RULES_HTML": rules_html,
            "NOTICE_HTML": notice_html,
            "READ_TIME": _e(datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S %Z")),
        },
    )
