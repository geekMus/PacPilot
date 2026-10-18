"""HTTP routes for the PAC endpoint, status page, and optional admin panel."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from html import escape
import hmac
import json
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit

from . import auth
from .pac import PAC_PATH, generate_pac
from .settings import validate_settings
from .storage import get_settings, save_settings
from .views import STATIC_DIR, render_admin, render_login, render_status

PORT = 8080
MAX_FORM_BYTES = 64 * 1024
_STATIC_TYPES = {
    "/static/app.css": ("app.css", "text/css; charset=utf-8"),
    "/static/admin.js": ("admin.js", "text/javascript; charset=utf-8"),
}
_ADMIN_GET = {"/admin", "/admin/"}
_ADMIN_POST = {"/admin/save", "/admin/generate", "/admin/logout"}


def _send(handler, status, body, content_type="text/html; charset=utf-8", extra_headers=None):
    data = body.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(data)))
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("X-Content-Type-Options", "nosniff")
    handler.send_header("X-Frame-Options", "DENY")
    handler.send_header("Referrer-Policy", "same-origin")
    handler.send_header(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
        "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    )
    if handler.headers.get("X-Forwarded-Proto", "").lower() == "https":
        handler.send_header("Strict-Transport-Security", "max-age=31536000")
    for name, value in (extra_headers or []):
        handler.send_header(name, value)
    handler.end_headers()
    handler.wfile.write(data)


def _redirect(handler, location, extra_headers=None):
    handler.send_response(303)
    handler.send_header("Location", location)
    handler.send_header("Cache-Control", "no-store")
    for name, value in (extra_headers or []):
        handler.send_header(name, value)
    handler.send_header("Content-Length", "0")
    handler.end_headers()


def _not_found(handler):
    _send(handler, 404, "Not Found\n", "text/plain; charset=utf-8")


def _parse_form(handler):
    try:
        length = int(handler.headers.get("Content-Length", "0"))
    except ValueError:
        raise ValueError("无效的请求长度。")
    if length < 0 or length > MAX_FORM_BYTES:
        raise ValueError("表单内容过大。")
    raw = handler.rfile.read(length).decode("utf-8", errors="replace")
    return {key: values[-1] for key, values in parse_qs(raw, keep_blank_values=True).items()}


def _message_url(message="", error=""):
    params = {}
    if message:
        params["message"] = message[:500]
    if error:
        params["error"] = error[:1000]
    return "/admin" + (("?" + urlencode(params)) if params else "")


def _query_messages(handler):
    query = parse_qs(urlsplit(handler.path).query)
    return query.get("message", [""])[0], query.get("error", [""])[0]


def _redirect_login(handler, headers=None):
    _redirect(handler, "/login", headers)


class RequestHandler(BaseHTTPRequestHandler):
    server_version = "genpac-runner"
    sys_version = ""

    def log_message(self, fmt, *args):
        print("[%s] %s" % (self.log_date_time_string(), fmt % args), flush=True)

    def do_GET(self):
        path = urlsplit(self.path).path

        if path in ("/login", "/admin/login") or path in _ADMIN_GET:
            if not auth.enabled():
                _not_found(self)
                return
            session = auth.get_session(self)
            if path in ("/login", "/admin/login"):
                if session:
                    _redirect(self, "/admin")
                else:
                    csrf = auth.create_login_csrf(self)
                    _send(self, 200, render_login(csrf))
                return
            if not session:
                _redirect_login(self)
                return
            message, error = _query_messages(self)
            _send(
                self,
                200,
                render_admin(session["csrf"], message=message, error=error),
            )
            return

        if path == "/":
            _redirect(self, "/proxy.pac")
            return

        if path == "/status":
            _send(self, 200, render_status(admin_enabled=auth.enabled()))
            return

        if path == "/proxy.pac":
            try:
                content = PAC_PATH.read_text(encoding="utf-8")
            except OSError:
                _send(self, 404, "PAC 尚未生成，请进入后台生成或查看启动日志。\n", "text/plain; charset=utf-8")
                return
            _send(
                self,
                200,
                content,
                "application/x-ns-proxy-autoconfig; charset=utf-8",
            )
            return

        if path in _STATIC_TYPES:
            filename, content_type = _STATIC_TYPES[path]
            try:
                content = (STATIC_DIR / filename).read_text(encoding="utf-8")
            except OSError:
                _send(self, 404, "Not Found\n", "text/plain; charset=utf-8")
                return
            _send(self, 200, content, content_type)
            return

        _not_found(self)

    def do_POST(self):
        path = urlsplit(self.path).path
        if path == "/login":
            if not auth.enabled():
                _not_found(self)
                return
            try:
                form = _parse_form(self)
            except ValueError as error:
                _send(self, 413, escape(str(error)), "text/plain; charset=utf-8")
                return
            csrf_valid = auth.validate_login_csrf(self, form.get("login_csrf", ""))
            if not csrf_valid:
                _send(self, 403, render_login(error=True))
                return
            authenticated, blocked = auth.authenticate(self, form.get("password", ""))
            if authenticated:
                token, _session = auth.create_session()
                _redirect(self, "/admin", auth.cookie_headers(self, token))
            elif blocked:
                _send(self, 429, render_login(error=True))
            else:
                _send(self, 401, render_login(error=True))
            return

        if path in _ADMIN_GET or path in _ADMIN_POST:
            if not auth.enabled():
                _not_found(self)
                return
            session = auth.get_session(self)
            if not session:
                _redirect_login(self)
                return
            try:
                form = _parse_form(self)
            except ValueError as error:
                _send(self, 413, escape(str(error)), "text/plain; charset=utf-8")
                return
            if not hmac.compare_digest(str(form.get("csrf", "")), session["csrf"]):
                _send(self, 403, "CSRF 校验失败，请刷新后台页面后重试。\n", "text/plain; charset=utf-8")
                return

            if path == "/admin/logout":
                auth.drop_session(self)
                _redirect_login(self, auth.clear_cookie_headers(self))
                return

            if path == "/admin/generate":
                try:
                    details = generate_pac()
                    _redirect(self, _message_url(message="PAC 已更新：" + details))
                except Exception as error:
                    _redirect(self, _message_url(error="生成失败：" + str(error)))
                return

            if path == "/admin/save":
                try:
                    current = get_settings()
                    settings = validate_settings(form, current)
                    save_settings(settings)
                    if form.get("save_action") == "save_generate":
                        details = generate_pac()
                        _redirect(self, _message_url(message="配置已保存，PAC 已生成：" + details))
                    else:
                        _redirect(self, _message_url(message="设置已保存到 SQLite。"))
                except (ValueError, OSError) as error:
                    _send(
                        self,
                        400,
                        render_admin(session["csrf"], error=str(error), submitted=form),
                    )
                except Exception as error:
                    _redirect(self, _message_url(error="操作失败：" + str(error)))
                return

        _not_found(self)


def make_server():
    return ThreadingHTTPServer(("", PORT), RequestHandler)
