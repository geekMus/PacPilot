#!/usr/bin/env python3
"""Tiny HTTP server for proxy.pac and its live rule status page."""
from datetime import datetime
from html import escape
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import re
from urllib.parse import urlsplit

PAC_FILE = "/data/proxy.pac"
PORT = 8080


def parse_js_array(source, name):
    """Read a string array embedded in the active custom PAC."""
    match = re.search(
        r"\bvar\s+" + re.escape(name) + r"\s*=\s*\[(.*?)\]\s*;",
        source,
        re.DOTALL,
    )
    if not match:
        return None

    raw = match.group(1).strip()
    if not raw:
        return []

    literals = re.findall(r'"(?:\\.|[^"\\])*"', raw)
    try:
        return [json.loads(item) for item in literals]
    except (TypeError, ValueError):
        return None


def parse_js_string(source, name):
    """Read a quoted string variable embedded in the active custom PAC."""
    match = re.search(
        r"\bvar\s+" + re.escape(name) + r"\s*=\s*("(?:\\.|[^"\\])*")\s*;",
        source,
    )
    if not match:
        return None
    try:
        return json.loads(match.group(1))
    except (TypeError, ValueError):
        return None


def render_rule_items(rules, empty_text):
    if not rules:
        return '<li class="empty-state">' + escape(empty_text) + "</li>"

    rows = []
    for rule in rules:
        safe_rule = escape(rule)
        if "*" in rule:
            description = "按通配符模式匹配"
        else:
            description = "根域名及所有层级的子域名"
        rows.append(
            '<li class="rule-item" data-rule="' + safe_rule.lower() + '">'
            '<code>' + safe_rule + "</code>"
            '<span class="rule-desc">' + description + "</span>"
            "</li>"
        )
    return "\n".join(rows)


def render_status_page():
    try:
        with open(PAC_FILE, "r", encoding="utf-8") as pac_file:
            pac = pac_file.read()
    except OSError:
        pac = ""

    updated_at = escape(datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S %Z"))
    mode = "自定义规则模式"
    notice = ""
    summary = ""
    rules_html = ""
    proxy_text = ""

    is_custom = "User defined PAC (no genpac)" in pac
    if is_custom:
        block_list = parse_js_array(pac, "BLOCK_LIST")
        direct_list = parse_js_array(pac, "DIRECT_LIST")
        proxy_text = parse_js_string(pac, "PAC_PROXY")

        if block_list is None or direct_list is None or proxy_text is None:
            mode = "自定义规则模式（解析异常）"
            notice = (
                '<div class="notice warning"><strong>规则解析失败</strong>'
                "当前 proxy.pac 带有自定义规则标记，但无法完整读取规则变量。"
                "请检查生成文件格式，避免将不完整结果当成当前生效规则。</div>"
            )
        else:
            summary = (
                '<div class="stat"><span class="stat-label">直连规则</span>'
                '<strong>' + str(len(direct_list)) + '</strong><span class="stat-unit">条</span></div>'
                '<div class="stat"><span class="stat-label">黑名单规则</span>'
                '<strong>' + str(len(block_list)) + '</strong><span class="stat-unit">条</span></div>'
                '<div class="stat"><span class="stat-label">默认代理</span>'
                '<strong class="stat-proxy">已启用</strong><span class="stat-unit">兜底规则</span></div>'
            )
            rules_html = (
                '<section class="panel"><div class="panel-head"><div><span class="eyebrow">DIRECT</span>'
                '<h2>直连规则</h2></div><span class="count">' + str(len(direct_list)) + ' 条</span></div>'
                '<p class="panel-desc">命中以下规则的域名直接连接，不经过代理。</p>'
                '<ul class="rule-list">' + render_rule_items(direct_list, "没有配置额外的直连域名。") + '</ul></section>'
                '<section class="panel"><div class="panel-head"><div><span class="eyebrow">BLOCK</span>'
                '<h2>黑名单 / 拦截规则</h2></div><span class="count">' + str(len(block_list)) + ' 条</span></div>'
                '<p class="panel-desc">命中以下规则时，PAC 返回 <code>PROXY 0.0.0.0:0</code>，这是拦截尝试，不是普通代理。</p>'
                '<ul class="rule-list">' + render_rule_items(block_list, "没有配置黑名单规则。") + '</ul></section>'
            )
            proxy_text = escape(proxy_text)
            notice = (
                '<div class="notice"><strong>默认代理范围</strong>'
                '未命中内网/本地直连规则、黑名单或直连列表的其他主机，都会返回 '
                '<code>' + proxy_text + '</code>。若代理字符串包含 <code>; DIRECT</code>，'
                "浏览器在代理不可用时可能回退直连。</div>"
            )
    else:
        mode = "非自定义模板（可能为 genpac 模式）"
        notice = (
            '<div class="notice warning"><strong>当前 PAC 不是自定义规则模板</strong>'
            "当前 proxy.pac 中没有找到本项目的自定义规则标记。若启用了 "
            "<code>GFWLIST_URL</code>，实际规则由 genpac 生成，"
            "<code>PAC_DIRECT_LIST</code> 和 <code>PAC_BLOCK_LIST</code> 不会注入该模式的 PAC。"
            "为避免显示未生效的环境变量，本页不会把这些列表误报为有效规则。"
            '请通过 <a href="/proxy.pac">查看当前 PAC 原文</a> 检查实际脚本。</div>'
        )
        summary = (
            '<div class="stat"><span class="stat-label">规则来源</span>'
            '<strong class="stat-proxy">PAC 文件</strong><span class="stat-unit">当前生成结果</span></div>'
            '<div class="stat"><span class="stat-label">自定义列表</span>'
            '<strong>未确认</strong><span class="stat-unit">不展示为生效规则</span></div>'
            '<div class="stat"><span class="stat-label">分流策略</span>'
            '<strong class="stat-proxy">genpac / 其他</strong><span class="stat-unit">请查看 PAC 原文</span></div>'
        )

    page = """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>PAC 规则状态 · genpac-runner</title>
<style>
:root{color-scheme:light dark;--bg:#f4f6fa;--surface:#fff;--text:#182230;--muted:#667085;--line:#e6eaf0;--accent:#315efb;--green:#16865c;--red:#c63d4f;--shadow:0 10px 30px rgba(24,34,48,.055)}
@media(prefers-color-scheme:dark){:root{--bg:#10141b;--surface:#191f29;--text:#e7ecf4;--muted:#9da8b8;--line:#2a3340;--accent:#89a4ff;--green:#61d5a3;--red:#ff8e9b;--shadow:0 10px 30px rgba(0,0,0,.12)}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
.wrap{width:min(1020px,calc(100% - 32px));margin:36px auto 56px}
.topbar{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:34px}
.brand{font-weight:750;letter-spacing:.02em}.brand small{display:block;color:var(--muted);font-size:12px;font-weight:500;letter-spacing:.12em}
.nav{display:flex;gap:16px;flex-wrap:wrap;font-size:14px}
.kicker{color:var(--accent);font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}
h1{font-size:clamp(28px,5vw,40px);letter-spacing:-.035em;line-height:1.16;margin:9px 0 12px}
.intro{color:var(--muted);max-width:680px;margin:0}
.mode{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);background:var(--surface);padding:7px 11px;border-radius:999px;font-size:13px;margin-top:18px}
.dot{width:8px;height:8px;border-radius:50%;background:var(--green)}
.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:28px 0}
.stat,.panel,.notice,.policy{background:var(--surface);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow)}
.stat{padding:19px 20px;min-height:112px}.stat-label{display:block;font-size:13px;color:var(--muted);margin-bottom:8px}
.stat strong{font-size:28px;line-height:1.15;letter-spacing:-.035em}.stat-unit{font-size:12px;color:var(--muted);margin-left:7px}.stat .stat-proxy{font-size:19px;letter-spacing:0}
.rule-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.panel{padding:21px;min-width:0}.panel-head{display:flex;justify-content:space-between;align-items:center;gap:12px}
.eyebrow{color:var(--muted);font-weight:800;letter-spacing:.13em;font-size:10px}h2{font-size:20px;margin:2px 0 0;letter-spacing:-.02em}
.count{white-space:nowrap;border-radius:999px;padding:4px 9px;background:var(--bg);color:var(--muted);font-size:12px}
.panel-desc{font-size:13px;color:var(--muted);min-height:42px;margin:14px 0}
.rule-list{list-style:none;padding:0;margin:0;display:grid;gap:8px}
.rule-item{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 11px;border:1px solid var(--line);border-radius:10px;min-width:0}
.rule-item code{overflow-wrap:anywhere;color:var(--text);font:13px ui-monospace,SFMono-Regular,Consolas,monospace}
.rule-desc{flex-shrink:0;color:var(--muted);font-size:11px;text-align:right}
.empty-state{padding:17px 12px;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:10px;font-size:13px}
.search-wrap{margin:0 0 18px}.search{width:100%;border:1px solid var(--line);background:var(--surface);color:var(--text);font:inherit;padding:12px 14px;border-radius:12px;outline:none}.search:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 17%,transparent)}
.notice{padding:17px 19px;margin-top:16px;color:var(--muted);font-size:14px}.notice strong{display:block;color:var(--text);margin-bottom:5px}.notice code{color:var(--text);overflow-wrap:anywhere}.notice.warning{border-color:color-mix(in srgb,#d98b24 45%,var(--line))}
.policy{padding:20px;margin-top:16px}.policy h2{margin-bottom:10px}.policy ul{margin:0;padding-left:20px;color:var(--muted);font-size:14px}.policy li+li{margin-top:4px}
footer{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;color:var(--muted);font-size:12px;margin-top:26px}
.hidden{display:none!important}
@media(max-width:700px){.wrap{margin-top:22px}.topbar{align-items:flex-start;flex-direction:column;margin-bottom:27px}.stats{grid-template-columns:1fr;gap:9px;margin:20px 0}.stat{min-height:auto;padding:14px 16px}.stat strong{font-size:24px}.rule-grid{grid-template-columns:1fr}.panel{padding:17px}.panel-desc{min-height:0}.rule-item{align-items:flex-start;flex-direction:column;gap:3px}.rule-desc{text-align:left}.nav{gap:12px}}
</style>
</head>
<body>
<main class="wrap">
<header class="topbar">
<div class="brand">genpac-runner<small>PAC RULE INSPECTOR</small></div>
<nav class="nav"><a href="/status">规则状态</a><a href="/proxy.pac">查看 PAC 原文 ↗</a></nav>
</header>
<section>
<div class="kicker">Current configuration</div>
<h1>PAC 规则状态</h1>
<p class="intro">查看当前生成文件中的分流规则。这里读取的是容器内实际的 <code>/data/proxy.pac</code>，不是单纯展示环境变量。</p>
<div class="mode"><span class="dot"></span><span>当前识别：__MODE__</span></div>
</section>
<div class="stats">__SUMMARY__</div>
<div class="search-wrap"><input id="filter" class="search" type="search" placeholder="搜索域名规则，例如 baidu.com、*.example.com" aria-label="搜索域名规则"></div>
<div class="rule-grid">__RULES__</div>
__NOTICE__
<section class="policy">
<h2>内置直连策略与规则优先级</h2>
<ul>
<li>本地和内网规则优先直连：<code>localhost</code>、不含点号的主机名，以及 <code>127.0.0.0/8</code>、<code>10.0.0.0/8</code>、<code>172.16.0.0/12</code>、<code>192.168.0.0/16</code>。</li>
<li>之后依次检查黑名单、额外直连列表；未命中时使用默认代理策略。</li>
<li>不带 <code>*</code> 的规则（例如 <code>baidu.com</code>）会匹配根域名及其所有层级子域名；包含 <code>*</code> 的规则按 PAC 的通配符模式匹配。</li>
<li>黑名单返回 <code>PROXY 0.0.0.0:0</code>，属于拦截尝试；浏览器对无效代理的处理可能不同，它不等价于防火墙级阻断。</li>
</ul>
</section>
<footer><span>配置读取时间：__UPDATED__</span><span>页面自动读取当前 PAC；刷新即可更新。</span></footer>
</main>
<script>
const search = document.getElementById('filter');
if (search) {
  search.addEventListener('input', () => {
    const query = search.value.trim().toLowerCase();
    document.querySelectorAll('.rule-item').forEach((item) => {
      item.classList.toggle('hidden', !item.dataset.rule.includes(query));
    });
  });
}
</script>
</body>
</html>"""
    return (
        page.replace("__MODE__", escape(mode))
        .replace("__SUMMARY__", summary)
        .replace("__RULES__", rules_html)
        .replace("__NOTICE__", notice)
        .replace("__UPDATED__", updated_at)
    )


class ProxyHandler(BaseHTTPRequestHandler):
    def _send(self, status, content, content_type):
        body = content.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlsplit(self.path).path

        if path == "/":
            self.send_response(302)
            self.send_header("Location", "/proxy.pac")
            self.end_headers()
            return

        if path == "/status":
            try:
                self._send(200, render_status_page(), "text/html; charset=utf-8")
            except Exception:
                self._send(
                    500,
                    "Unable to render PAC status page.\n",
                    "text/plain; charset=utf-8",
                )
            return

        if path == "/proxy.pac":
            try:
                with open(PAC_FILE, "r", encoding="utf-8") as pac_file:
                    content = pac_file.read()
                self._send(200, content, "text/plain; charset=utf-8")
            except OSError as error:
                self._send(
                    500,
                    "Unable to read proxy.pac: " + str(error) + "\n",
                    "text/plain; charset=utf-8",
                )
            return

        self._send(403, "Forbidden\n", "text/plain; charset=utf-8")

    def log_message(self, format_string, *args):
        print("[%s] %s" % (self.log_date_time_string(), format_string % args))


httpd = HTTPServer(("", PORT), ProxyHandler)
print("Serving /proxy.pac and /status on port %d" % PORT)
httpd.serve_forever()
