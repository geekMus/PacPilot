# Webhook notification architecture

PacPilot uses a domain-event → rule → channel → delivery pipeline. Channels hold provider configuration; rules match event type, phase, optional outcome and subject type, and can target multiple channels. All predicates are ANDed and one event can match multiple rules.

Event types intentionally describe business semantics, not implementation details: `task.execution` is valid whether PacPilot writes a PAC file or later evaluates configuration on demand. Supported types: `task.execution` (`started`, `finished`), `config.publish` (`started`, `finished`, `state_changed`), `request.process` (`started`, `finished`), `system.error` (`state_changed`). Start events have no final outcome.

Events are persisted before dispatch. Deliveries have up to three attempts with bounded exponential backoff and jitter; HTTP 4xx are permanent except 429. History is bounded to 200 events and 500 deliveries. External delivery is at-least-once best effort and can duplicate if a receiver accepts a request but its response is lost.

The storage contract is asynchronous; SQLite uses a dedicated key in the existing settings table and memory storage keeps a separate document. API reads redact known URL query secrets, custom secret headers and DingTalk signing keys; unchanged masked secrets are preserved on updates. Legacy success/failure settings are migrated on first notification access into finished-success/finished-failure rules.
