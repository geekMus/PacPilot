"""Minimal session, CSRF and login throttling primitives."""
import hmac
import os
import secrets
import threading
import time
from http.cookies import SimpleCookie

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
SESSION_COOKIE = "genpac_admin"
SESSION_TTL = 12 * 60 * 60
LOGIN_CSRF_TTL = 10 * 60
_MAX_LOGIN_ATTEMPTS = 8
_BLOCK_SECONDS = 5 * 60

_SESSIONS = {}
_LOGIN_CSRF = {}
_FAILURES = {}
_LOCK = threading.Lock()


def enabled():
    """The admin is disabled when ADMIN_PASSWORD is unset or empty."""
    return bool(ADMIN_PASSWORD)


def client_key(handler):
    return handler.client_address[0] if handler.client_address else "unknown"


def _cookie_token(handler):
    cookie = SimpleCookie()
    try:
        cookie.load(handler.headers.get("Cookie", ""))
        morsel = cookie.get(SESSION_COOKIE)
        return morsel.value if morsel else ""
    except Exception:
        return ""


def get_session(handler):
    token = _cookie_token(handler)
    if not token:
        return None
    now = time.time()
    with _LOCK:
        for key, session in list(_SESSIONS.items()):
            if now - session["created"] > SESSION_TTL:
                _SESSIONS.pop(key, None)
        session = _SESSIONS.get(token)
        return dict(session) if session else None


def create_session():
    token = secrets.token_urlsafe(32)
    session = {"csrf": secrets.token_urlsafe(24), "created": time.time()}
    with _LOCK:
        _SESSIONS[token] = session
    return token, dict(session)


def drop_session(handler):
    token = _cookie_token(handler)
    with _LOCK:
        _SESSIONS.pop(token, None)


def cookie_headers(handler, token, max_age=SESSION_TTL):
    value = (
        SESSION_COOKIE + "=" + token + "; Path=/; HttpOnly; SameSite=Strict; Max-Age="
        + str(max_age)
    )
    if handler.headers.get("X-Forwarded-Proto", "").lower() == "https":
        value += "; Secure"
    return [("Set-Cookie", value)]


def clear_cookie_headers(handler):
    value = SESSION_COOKIE + "=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"
    if handler.headers.get("X-Forwarded-Proto", "").lower() == "https":
        value += "; Secure"
    return [("Set-Cookie", value)]


def create_login_csrf(handler):
    token = secrets.token_urlsafe(24)
    now = time.time()
    ip = client_key(handler)
    with _LOCK:
        for key, value in list(_LOGIN_CSRF.items()):
            if value["expires"] < now:
                _LOGIN_CSRF.pop(key, None)
        _LOGIN_CSRF[token] = {"ip": ip, "expires": now + LOGIN_CSRF_TTL}
    return token


def validate_login_csrf(handler, token):
    now = time.time()
    ip = client_key(handler)
    with _LOCK:
        item = _LOGIN_CSRF.pop(str(token), None)
    return bool(item and item["expires"] >= now and item["ip"] == ip)


def authenticate(handler, supplied_password):
    """Validate password and rate limit repeated failures per socket peer."""
    ip = client_key(handler)
    now = time.time()
    with _LOCK:
        item = _FAILURES.get(ip)
        if item and item.get("blocked_until", 0) > now:
            return False, True
        if item and item.get("blocked_until", 0) <= now and item.get("blocked_until", 0):
            _FAILURES.pop(ip, None)

    good = hmac.compare_digest(str(supplied_password), ADMIN_PASSWORD)
    with _LOCK:
        if good:
            _FAILURES.pop(ip, None)
        else:
            item = _FAILURES.setdefault(ip, {"count": 0, "blocked_until": 0})
            item["count"] += 1
            if item["count"] >= _MAX_LOGIN_ATTEMPTS:
                item["count"] = 0
                item["blocked_until"] = now + _BLOCK_SECONDS
    return good, False
