# PacPilot

**English** | [简体中文](README.zh-CN.md)

**PacPilot** is a PAC generation and management service with a web-based admin interface. It generates `/pac` from custom rules or a remote domain list, and provides workflow history, scheduled updates, webhook notifications, request monitoring, and data maintenance.

The project uses Bun, TypeScript, Vue 3, and SQLite. For deployment, use the prebuilt Docker image; you do not need to clone the source code or install build tools on the server.

## Features

- Two generation modes: custom rules and remote domain lists.
- Manual generation, instant-apply settings with automatic PAC regeneration, scheduled generation, and compressed output.
- Workflow queues, stages, error details, and execution history.
- Success/failure webhook notifications, with support for custom HTTP webhooks and DingTalk bots.
- Request monitoring, log and storage usage inspection, log cleanup, and factory reset.
- Chinese and English UI, with system, light, and dark themes.

## Quick Start

Docker Engine is required. Pull and start the image:

```bash
docker run -d \
  --name pacpilot \
  --restart unless-stopped \
  -p 17321:17321 \
  -v pacpilot-data:/data \
  ghcr.io/geekmus/pacpilot:latest
```

Open `http://<server-address>:17321/`. On first startup, a randomly generated administrator password is printed to the container logs:

```bash
docker logs pacpilot
```

A fresh database does not generate a PAC file automatically. Sign in to the admin interface, configure a generation mode, and start generation manually. Once generation succeeds, configure the PAC URL in your client.

> **Data note:** `/data` stores the database, settings, workflow history, and PAC files. Do not delete the data volume if you need to keep your data; backing it up before upgrades is recommended.

## Documentation

The documentation index is available in English and Chinese. The detailed deployment, configuration, development, operations, and troubleshooting guides are currently maintained in Chinese.

- [Documentation index](docs/README.md) · [中文文档目录](docs/README.zh-CN.md)
- [Deployment guide (methods & environment-parameter reference)](docs/deployment.md)
- [Configuration (in-app rules, scheduled generation, data files, admin password)](docs/configuration.md)
- [Webhook notifications (events, rules, delivery semantics)](docs/webhook-notifications.md)
- [Development guide (environment, commands, checks)](docs/development.md)
- [Operations and releases (workflows, logs, versions, upgrades)](docs/operations.md)
- [Troubleshooting](docs/troubleshooting.md)

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**.

- [Full license text](LICENSE)
- [Chinese license summary (unofficial)](LICENSE.zh-CN.md)
- [Official GNU license page](https://www.gnu.org/licenses/agpl-3.0.html)

AGPL-3.0 is a strong copyleft open-source license. In addition to the requirements for copying, modifying, and distributing the software, Section 13 generally requires modified versions that offer remote network interaction to provide those users with an opportunity to obtain the corresponding source code. Read the full license and assess the obligations for your specific use. Third-party components remain subject to their respective licenses.

## Community and Contributions

- [Contributing guide](CONTRIBUTING.md): development setup, tests, and pull request practices.
- [Security policy](SECURITY.md): privately report security vulnerabilities.
- [Code of conduct](CODE_OF_CONDUCT.md): community and collaboration expectations.
- [Support](SUPPORT.md): usage questions, feature requests, and licensing inquiries.
- [Open a usage question](https://github.com/geekMus/PacPilot/issues/new?template=question.yml): ask about configuration, deployment, and general usage.

Please read the contributing guide before submitting code. Do not disclose security vulnerabilities in public issues or discussions.

## Project Information

- Image: `ghcr.io/geekmus/pacpilot`
- Default tag: `latest`
- The current automated release workflow builds the `linux/arm64` image.
- The version is defined by `version` in `package.json`.

Source code, issue tracking, and releases: [geekMus/PacPilot](https://github.com/geekMus/PacPilot).
