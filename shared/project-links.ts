/** Canonical external project and documentation links used by the application. */
const REPOSITORY_URL = "https://github.com/geekMus/PacPilot";
const DOCS_URL = `${REPOSITORY_URL}/blob/main/docs`;

export const PROJECT_LINKS = {
  repository: REPOSITORY_URL,
  documentation: `${DOCS_URL}/README.md`,
  deployment: `${DOCS_URL}/deployment.md`,
  configuration: `${DOCS_URL}/configuration.md`,
  adminPasswordReset: `${DOCS_URL}/configuration.md#管理员密码重置`,
  development: `${DOCS_URL}/development.md`,
  operations: `${DOCS_URL}/operations.md`,
  troubleshooting: `${DOCS_URL}/troubleshooting.md`,
  packageJsonProxy:
    "https://github.mus.pp.ua/https://raw.githubusercontent.com/geekMus/PacPilot/refs/heads/main/package.json",
} as const;
