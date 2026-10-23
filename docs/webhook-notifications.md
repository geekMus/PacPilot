# Event-driven Webhook notifications

Channels store provider configuration; rules match event type, lifecycle phase, optional outcome and subject type and target one or more channels. Rule predicates are ANDed; one event can match multiple rules. Stable domain events (such as `task.execution`) describe business semantics rather than the current PAC-file implementation, allowing a future live configuration/request-processing backend.

Supported events: `task.execution` (started, finished), `config.publish` (started, finished, state_changed), `request.process` (started, finished), and `system.error` (state_changed). A start event has no final outcome.

Events are persisted before dispatch. Each delivery is retried up to three times with exponential backoff; 4xx errors are permanent except 429. History is bounded to 200 events and 500 deliveries. External delivery is at-least-once best effort and duplicates remain possible if a receiver accepts a request but its response is lost. Secret-bearing URL parameters, custom headers and DingTalk signing keys are redacted from channel reads. First access migrates legacy success/failure settings to rules.
