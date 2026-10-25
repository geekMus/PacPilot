# Storage adapter contract

This document is the implementation guide for anyone adding a database or storage driver to PacPilot. The canonical TypeScript API is `server/storage/repositories.ts`; this guide explains its semantics and compatibility requirements. Do not create a second, divergent copy of the interfaces.

## Required public shape

Every driver must return an `ApplicationStorage` with the same repository properties and asynchronous method signatures defined in `repositories.ts`: `settings`, `credentials`, `monitoring`, `workflows`, `artifacts`, `maintenance`, `driver`, and `close()`. Every repository operation and lifecycle operation returns a `Promise`; no adapter may expose a synchronous variant through `ApplicationStorage`.

- `driver` must identify the selected implementation using the supported driver union. Add a new literal to the union and configuration validation when adding a driver.
- The public storage contract is uniformly asynchronous. Callers must `await` reads, writes, maintenance operations, and `close()`; do not mix sync and async behavior by adapter. `Sync*Repository` types are private-to-the-storage-layer implementation contracts, not a service-facing API. Composition roots wrap concrete implementations using `asAsyncRepository` so the public surface has one shape.
- **Important driver limitation:** the current SQLite implementation still uses Bun's synchronous `bun:sqlite` API. The async contract makes future async drivers substitutable, but the wrapper does not move SQL work off the event loop. Do not describe current SQLite calls as non-blocking. A future requirement for genuinely non-blocking SQLite I/O must replace the synchronous driver or isolate it behind a worker, preserving the same contract and atomicity semantics.
- Methods must preserve exact return types and null/undefined distinctions in the interfaces; do not invent sentinel objects.
- Adapter constructors receive dependencies explicitly. SQL clients, transactions, and vendor-specific types must not leak into `repositories.ts`, routes, services, or domain types.
- `close()` returns `Promise<void>` and must release resources owned by the adapter. A memory adapter should clear volatile state; a persistent adapter must not delete persisted user data merely because it is closed. Await it during shutdown and in lifecycle tests.

## Repository data semantics

| Contract                    | Required semantics                                                                                                                                                                                                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SettingsRepository`        | `get()` returns normalized `AppSettings`; `set()` persists/replaces the complete normalized settings value; `update()` merges a partial patch, normalizes it, persists it, and returns the resulting settings.                                                                         |
| `AdminCredentialRepository` | `get()` returns a validated `AdminCredentialRecord` or `null`; `set()` replaces the complete credential record. Never log or expose secrets.                                                                                                                                           |
| `MonitoringRepository`      | `record()` stores the supplied event; `list()` and `count()` refer to the same event set; `summarize()` returns the full `MonitorSummary` shape; cleanup/clear affect only access events.                                                                                              |
| `WorkflowRepository`        | IDs uniquely identify runs/stages; stages remain attached to their run; `claim()` must atomically claim a run at most once; statuses and result unions must match the contract. `cleanup(retentionDays)` deletes only inactive runs older than the cutoff (compared by `created_at`); `clear()` deletes only inactive runs; both cascade stages, never touch pending/running runs, and back the log-retention and manual log-clearing flows. |
| `ArtifactRepository`        | Keys pass through `normalizeArtifactKey`; bytes round-trip unchanged; string writes are UTF-8; missing reads/stat return `undefined`; `delete()` returns whether an item existed; `list()` is deterministic and prefix-filtered; byte counts are bytes, not characters.                |
| `StorageMaintenance`        | `databaseBytes()` returns bytes; `compact()` and `checkpoint()` may be documented no-ops for a driver without those operations; `resetOperationalData(settings)` clears operational history atomically where supported and updates settings without deleting artifacts or credentials. |

## Data representation rules

- Use shared application types from `shared/contracts.ts` and domain normalization from `server/domain/settings.ts`; do not define driver-specific versions of `AppSettings`, `WorkflowRun`, or `WorkflowStage`.
- Preserve timestamps as ISO-compatible strings at the application boundary. Do not expose database-native date objects.
- Keep JSON serialization, integer/boolean conversion, and row-to-domain mapping inside the adapter. Validate parsed persisted JSON instead of blindly trusting it.
- Use the same pagination order and cursor meaning across drivers. Generated IDs must be monotonic within the relevant collection and suitable for `beforeId` pagination.
- Keep transactions around multi-step operations that must be atomic (workflow claim/stage operations, schema migration, operational reset). Failed operations must not leave partially applied state.
- Schema migrations must preserve existing user data, reject unsupported future schema versions, and run transactionally where possible.

## Adding a new adapter

1. Create a driver-specific directory such as `server/storage/postgres/`; put connection lifecycle, schema/migrations, query modules, and repository implementations there.
2. Implement every interface in `repositories.ts` without changing public semantics. Use compile-time `implements` checks or typed factory return values.
3. Compose repositories into `ApplicationStorage` in that driver directory. Keep selection/dynamic loading in `server/storage/index.ts` so unselected drivers are not loaded.
4. Add driver configuration parsing and safe defaults. Never silently fall back to another driver if the configured driver fails to initialize.
5. Test settings normalization/update, credential round-trip, monitoring counts/pagination/cleanup, workflow atomic claim/stage/history protection, artifact binary round-trip/path safety, maintenance/reset, and close behavior against each adapter.
6. Add migration tests from the prior supported schema version and verify existing data remains readable.
7. Run `bun run typecheck`, `bun run test:core`, `bun run test:server:coverage`, `bun run test:client:coverage`, `bun run build`, `bun run check:i18n`, and `bun run format:check` as applicable. Compilation alone is not sufficient.

## Layering rules

- `repositories.ts` is the port/interface layer and must not import a concrete driver.
- `memory/` contains only volatile in-process implementations and must not import database APIs.
- `sqlite/` contains SQLite SQL, schema, migration, and connection concerns.
- Artifacts are a storage abstraction, not a SQL table: a driver may implement them with a filesystem or object store, but key normalization and binary semantics must remain consistent.
- Routes and services depend on `ApplicationStorage`/repository interfaces only. A new driver should require changes to the composition/configuration boundary and tests, not business routes.
