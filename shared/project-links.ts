/** Canonical external project links that the UI actually renders. */
const REPOSITORY_URL = "https://github.com/geekMus/PacPilot";

export const PROJECT_LINKS = {
  repository: REPOSITORY_URL,
  adminPasswordReset: `${REPOSITORY_URL}/blob/main/docs/configuration.md#管理员密码重置`,
  packageJsonProxy:
    "https://github.mus.pp.ua/https://raw.githubusercontent.com/geekMus/PacPilot/refs/heads/main/package.json",
} as const;
