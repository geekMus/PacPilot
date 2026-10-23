# Documentation

[English](README.md) | [简体中文](README.zh-CN.md)

This directory contains the project's user, deployment, development, and operations documentation. This index is available in English and Chinese; the detailed guides linked below are currently maintained in Chinese. The root [README.md](../README.md) provides a project overview, quick start, and documentation links. Detailed guidance belongs in the relevant document so that routine documentation updates do not require frequent edits to the root README.

| Document | Description |
| --- | --- |
| [Vercel test deployment](vercel-test-deployment.md) | Test-only Vercel configuration, limitations, and maintenance conventions (not for production) |
| [Deployment guide](deployment.md) | Docker, Docker Compose, first startup, and common access URLs |
| [Configuration](configuration.md) | PAC rules, environment variables, data files, CORS policy, and administrator password |
| [Development guide](development.md) | Local development environment, common commands, and checks |
| [Operations and releases](operations.md) | Workflows, log and data maintenance, image releases, and upgrades |
| [Troubleshooting](troubleshooting.md) | Web UI, login, PAC generation, remote lists, and upgrade issues |

## Documentation conventions

- Keep user-facing deployment, configuration, usage, and troubleshooting guidance in `docs/`.
- Keep development, testing, build, and release process documentation in `docs/`, organized by topic.
- The root `README.md` should contain only the project overview, a minimal quick start, and links to documentation.
- Commands, environment variables, ports, routes, and workflow behavior documented here must match the source code and configuration. Review the relevant documentation when implementation changes.
- Source code and workflows must not depend on README section positions or wording. Machine-readable configuration should use structured configuration or standalone scripts rather than parsing README files.
