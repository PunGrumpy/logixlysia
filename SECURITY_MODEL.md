# Security model

This file describes who and what logixlysia trusts, so security reviews and scans judge findings against it. To report a vulnerability, see `SECURITY.md`.

## System overview

Logixlysia is a request-scoped logging plugin for Elysia, published to npm from `packages/logixlysia`. It runs inside the downstream app's process and writes request data to the terminal, files and custom transports.

## Components

| Component  | Code                  | Distribution surface |
| ---------- | --------------------- | -------------------- |
| logixlysia | `packages/logixlysia` | npm package          |
| CI/release | `.github/workflows/*` | npm package          |

## Assets

- Downstream apps' logs and whatever they contain (headers, bodies, user data).
- Integrity of the published `logixlysia` package and its release workflow.

Critical assets across the maintainer's projects, in the maintainer's words: secrets in CI of action users (Cursor API key, `GITHUB_TOKEN`); root privileges and network config on Macs running Peony; integrity of published npm packages and releases; pigo API availability; and the data of downstream apps that use the libraries (logs, vectors, LINE messages).

## Trust boundaries and entry points

- **Request data → logs**: request headers, bodies, query, client IP and context set with `mergeContext` reach every sink. `autoRedact` is the control for secrets; gaps let secrets land in logs.
- **Logs → readers**: terminal output and the context tree print request-controlled text, so ANSI or newline injection can forge or hide lines.
- **File sink**: file paths and rotation run with the app's permissions.
- **Release**: `release.yml` publishes to npm.

## Attackers that matter

- End users of a downstream app, who control request data.
- A supply-chain attacker targeting the release workflow or npm publish.

## Existing controls

- `autoRedact` masks sensitive keys.
- Disclosure through private advisories (`SECURITY.md`).

## Out of scope

- `apps/docs` (docs site), `packages/bench`, `packages/video`.
- Across the maintainer's projects: docs and marketing sites, and bench and video packages.
