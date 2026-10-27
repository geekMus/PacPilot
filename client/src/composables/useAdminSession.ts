import { api, type AdminSession } from "@/api/client";

let cache: { at: number; data: AdminSession } | null = null;
const CACHE_TTL_MS = 2500;

/** Invalidate after login, logout, or password change so guards see fresh state. */
export function invalidateAdminSessionCache(): void {
  cache = null;
}

export async function fetchAdminSession(force = false): Promise<AdminSession> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.data;
  }
  const data = await api.session();
  cache = { at: Date.now(), data };
  return data;
}

/** `/admin` 本身也是受保护入口：服务端会把裸 `/admin` 交给 SPA，需要一并校验。 */
export function isAdminAppRoute(path: string): boolean {
  return path === "/admin" || path.startsWith("/admin/");
}
