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
- `redactPatterns` adds value patterns that `autoRedact` masks in every string a record carries, on top of the built-in patterns for emails, IP addresses, Luhn-valid card numbers and JWTs.
- A failed validation's payload (`found`/`errors`) is logged only with `logErrorPayload: true`.
- The query string is stripped from the URL sent to transports and written to the log file unless `logQueryParams` is on.
- Adapter endpoints must use `http:` or `https:`, and adapter requests do not follow redirects (`redirect: 'error'`).
- Line breaks and tabs in request-controlled text are escaped and other control characters, including the escape that starts an ANSI sequence, are removed before a text sink prints it (`sanitizeLogText`).
- An inbound request id is used only when it matches `^[A-Za-z0-9._-]{1,128}$`; otherwise a new one is generated.
- Log files are created with mode `0o600` unless `logFileMode` says otherwise.
- Path globs reject repeated `**` and more than two `*` per segment, and a pathname longer than 2048 characters is not matched, so a request path cannot make matching slow.
- Nesting depth is capped: the context tree expands `contextDepth` levels (2 by default), serialization and redaction stop at 64 levels, and an error's cause chain is followed at most 3 levels.

## Out of scope

- `apps/docs` (docs site), `packages/bench`, `packages/video`.
- Across the maintainer's projects: docs and marketing sites, and bench and video packages.
