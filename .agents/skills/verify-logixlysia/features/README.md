# logixlysia verification map

This directory is the maintained source for verifying what an app using logixlysia sees. Read this index before driving, then use the matching feature file as the recipe.

## Baseline preconditions

- `packages/logixlysia` is built from this checkout with `bun run build`.
- `C=.agents/skills/verify-logixlysia/scripts/control-logixlysia.ts` is set in a shell at the repository root.
- `$C up --run "$RUN"` printed `ready`, and `$C doctor --run "$RUN"` exits 0.
- Every app a recipe names was written to the run's `work/`, the path `up` printed, with the source the recipe gives.

## Driving conventions

- Run every server through `$C run --run "$RUN" --app <file> --req '<METHOD> <path>'`. Never call `.listen()` in the app; the helper refuses it.
- Use `consoleFormat: 'json'` when a recipe asserts a number, and parse `<NN>-<label>.stdout.log` with `jq`. The text line is for humans and rounds durations.
- stdout is a pipe and `NO_COLOR=1` is set, so text lines are plain and have no colors.
- Requests run one after another in one server, so state such as a request ID counter carries across them.

## Proof and skip reporting

- Proof is the evidence file `run` writes. It holds the app source, each response, server stdout and stderr, the stop, blocked outbound requests and files written.
- Name the feature file and sub-feature ID with every proof.
- Assert the stream as well as the line. `INFO` and `DEBUG` go to stdout, `WARN` and `ERROR` to stderr.
- Report an unreachable path with the attempted command and the unmet precondition. Don't report a skipped entry point as verified through a different one.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with control-logixlysia` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

## Features

- [Request logs](./request-logs.md) covers the access line, `log.*` lines, `mergeContext`, and the level and stream for 2xx, 4xx and 5xx.
- [Route filter](./log-filter.md) covers `logFilter.include` and `logFilter.exclude`.
- [Sampling](./sampling.md) covers head sampling, tail rescue by duration and status, and the duration a replayed record keeps.
- [File logging](./file-logging.md) covers `logFilePath` and the fixed file line.
- [Request ID](./request-id.md) covers a generated ID and an honored upstream `x-request-id`.

## Not verifiable with this helper

- Adapters and transports (Axiom, Datadog, OTLP and the rest). The loopback proxy refuses their requests, so a run proves only the attempt, listed under blocked outbound requests.
- Colored and TTY output. The server's stdout is a pipe.
- WebSocket logging. `run` sends only HTTP requests.
- Elysia 2. `up` links the Elysia this checkout installed. The package CI covers the prereleases.
