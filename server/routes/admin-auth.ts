import { Router } from "express";
import { getAdminSessionSecret } from "../services/admin-credentials";
import type { ApplicationStorage } from "../storage/repositories";
import type { EnvConfig } from "../config/env";
import {
  checkLoginRateLimit,
  clearLoginFailures,
  clearSessionCookie,
  createSessionToken,
  isLoggedIn,
  recordLoginFailure,
  requireAdmin,
  setSessionCookie,
  SESSION_TTL_MS,
} from "../middleware/auth";
import {
  AdminPasswordError,
  changeAdminPassword,
  isAdminCredentialsMissing,
  verifyAdminPassword,
} from "../services/admin-credentials";

export function adminAuthRoutes(env: EnvConfig, storage: ApplicationStorage): Router {
  const router = Router();
  router.get("/api/admin/session", async (req, res) =>
    res.json({
      loggedIn: await isLoggedIn(req, storage.credentials),
      adminCredentialsMissing: await isAdminCredentialsMissing(storage.credentials),
      authMode: env.corsMode === "open" ? "bearer" : "cookie",
    })
  );
  router.post("/api/admin/login", async (req, res) => {
    if (await isAdminCredentialsMissing(storage.credentials)) {
      res.status(428).json({ error: "setup_required" });
      return;
    }
    const rateError = checkLoginRateLimit(req);
    if (rateError) {
      res.status(429).json({ error: rateError });
      return;
    }
    const pw = String(req.body?.password ?? "");
    if (!(await verifyAdminPassword(storage.credentials, pw))) {
      recordLoginFailure(req);
      res.status(401).json({ error: "Invalid password" });
      return;
    }
    clearLoginFailures(req);
    const token = createSessionToken(await getAdminSessionSecret(storage.credentials));
    const expiresAt = Date.now() + SESSION_TTL_MS;
    // A separately hosted static frontend gets no usable cookie (third-party
    // cookies are blocked by Safari/Firefox), so it authenticates with the
    // bearer token returned here.
    if (env.corsMode !== "open") {
      const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
      setSessionCookie(res, token, secure);
    }
    res.json({ ok: true, token, expiresAt });
  });
  router.post("/api/admin/logout", (req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });
  router.post("/api/admin/password", requireAdmin(storage.credentials), async (req, res) => {
    try {
      await changeAdminPassword(
        storage.credentials,
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
