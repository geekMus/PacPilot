import { Router } from "express";
import type { AppDatabase } from "../db/sqlite";
import { getAdminSessionSecret } from "../services/admin-credentials";
import {
  checkLoginRateLimit,
  clearLoginFailures,
  clearSessionCookie,
  createSessionToken,
  isLoggedIn,
  recordLoginFailure,
  requireAdmin,
  setSessionCookie,
} from "../middleware/auth";
import {
  AdminPasswordError,
  changeAdminPassword,
  isAdminCredentialsMissing,
  verifyAdminPassword,
} from "../services/admin-credentials";

export function adminAuthRoutes(database: AppDatabase): Router {
  const router = Router();
  router.get("/api/admin/session", (req, res) =>
    res.json({
      loggedIn: isLoggedIn(req, database),
      adminCredentialsMissing: isAdminCredentialsMissing(database),
    })
  );
  router.post("/api/admin/login", (req, res) => {
    if (isAdminCredentialsMissing(database)) {
      res.status(428).json({ error: "setup_required" });
      return;
    }
    const rateError = checkLoginRateLimit(req);
    if (rateError) {
      res.status(429).json({ error: rateError });
      return;
    }
    const pw = String(req.body?.password ?? "");
    if (!verifyAdminPassword(database, pw)) {
      recordLoginFailure(req);
      res.status(401).json({ error: "Invalid password" });
      return;
    }
    clearLoginFailures(req);
    const token = createSessionToken(getAdminSessionSecret(database));
    const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
    setSessionCookie(res, token, secure);
    res.json({ ok: true });
  });
  router.post("/api/admin/logout", (req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });
  router.post("/api/admin/password", requireAdmin(database), (req, res) => {
    try {
      changeAdminPassword(
        database,
        String(req.body?.currentPassword ?? ""),
        String(req.body?.newPassword ?? "")
      );
      clearSessionCookie(res);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : String(e),
        ...(e instanceof AdminPasswordError ? { errorCode: e.code } : {}),
      });
    }
  });
  return router;
}
