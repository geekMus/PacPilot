# Backend architecture

## Naming conventions

Backend TypeScript source files use **kebab-case** (for example, `request-monitor.ts`, `admin-credentials.ts`, and `application-storage.ts`). This is a filename convention, not a requirement to rename TypeScript symbols: exported types and classes use PascalCase; functions and variables use camelCase; constants use UPPER_SNAKE_CASE when they are true constants. Keep names specific to the responsibility rather than generic names such as `common.ts`, `helpers.ts`, or `manager.ts`.

## Storage boundaries

`server/storage/repositories.ts` is the storage contract: it describes the application-facing repository interfaces and the aggregate `ApplicationStorage` shape. It must not import a concrete database driver.

- `server/storage/memory/` contains in-process adapters. They are volatile and must not import SQLite or Bun database APIs.
- `server/storage/sqlite/` contains SQLite-specific adapters, schema, connection lifecycle, and SQL queries. Keep SQL and database types inside this directory.
- `server/storage/index.ts` is the composition/factory boundary. It chooses the adapter from configuration and dynamically imports SQLite only when the SQLite driver is selected.
- `server/storage/artifact-key.ts` contains storage-driver-independent key normalization shared by adapters.

The memory and SQLite adapters implement the same contracts. Routes and services depend on `ApplicationStorage` and repository interfaces, never on a concrete adapter. When changing a repository contract, update both adapters and run both adapter test suites.

## Layer responsibilities

- `config/`: environment parsing and runtime configuration; read process environment at the boundary.
- `domain/`: pure domain rules and normalized domain values, independent of Express and persistence.
- `routes/`: HTTP route composition and request/response boundary; avoid embedding persistence queries or large business workflows.
- `services/`: application workflows and integrations such as PAC generation, remote lists, scheduling, and webhooks.
- `storage/`: repository contracts and persistence adapters only.
- `middleware/`: reusable HTTP middleware.
- `utils/`: small, framework-independent technical helpers. If a utility belongs to one domain, keep it next to that domain instead.
- `tests/`: backend tests should mirror the boundary they exercise. Adapter contract behavior should be checked for both memory and SQLite where practical.

## Refactoring rules

1. Keep dependencies pointing toward contracts: routes/services may depend on storage contracts; adapters implement those contracts; contracts must not depend on adapters.
2. Do not put SQLite and memory implementations side by side in the storage root. Keep each implementation under its driver directory.
3. Split files when they contain independently testable responsibilities or have become difficult to navigate. Avoid splitting small, cohesive functions into one-function files without a clear boundary.
4. Preserve existing runtime behavior and data formats during structural moves. Treat schema changes and persistence behavior changes as separate changes.
5. Every structural refactor must update imports and tests, then pass typecheck, backend tests, client tests when shared code is touched, build, and i18n checks as applicable.
