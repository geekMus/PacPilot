# Documentation

[English](README.md) | [简体中文](README.zh-CN.md)

This directory contains the project's user, deployment, development, and operations documentation. This index is available in English and Chinese; the detailed guides linked below are currently maintained in Chinese. The root [README.md](../README.md) provides a project overview, quick start, and documentation links. Detailed guidance belongs in the relevant document so that routine documentation updates do not require frequent edits to the root README.

## User guide

| Document                                          | Description                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [Deployment guide](deployment.md)                 | Deployment methods, the full environment-parameter reference, persistence and backup, and common access URLs |
| [Configuration](configuration.md)                 | In-app settings: PAC rules, scheduled generation, data files, and administrator password                     |
| [Webhook notifications](webhook-notifications.md) | Event-driven success/failure notifications over custom HTTP webhooks and DingTalk bots                       |
| [Troubleshooting](troubleshooting.md)             | Web UI, login, PAC generation, remote lists, and upgrade issues                                              |

## Development & architecture

| Document                                                | Description                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------ |
| [Development guide](development.md)                     | Local development environment, common commands, and checks               |
| [Frontend architecture](frontend-architecture.md)       | Shared component boundaries, editor architecture, naming, and validation |
| [Backend architecture](backend-architecture.md)         | Backend layering, dependency direction, and the async storage contract   |
| [Storage adapter contract](storage-adapter-contract.md) | Repository contracts every storage adapter must implement                |

## Operations

| Document                                 | Description                                                                |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| [Operations and releases](operations.md) | Admin maintenance entry points, CI workflows, image releases, and upgrades |

## Documentation conventions

- Keep user-facing deployment, configuration, usage, and troubleshooting guidance in `docs/`.
- Keep development, testing, build, and release process documentation in `docs/`, organized by topic.
- The root `README.md` should contain only the project overview, a minimal quick start, and links to documentation.
- Commands, environment variables, ports, routes, and workflow behavior documented here must match the source code and configuration. Review the relevant documentation when implementation changes.
- Source code and workflows must not depend on README section positions or wording. Machine-readable configuration should use structured configuration or standalone scripts rather than parsing README files.
