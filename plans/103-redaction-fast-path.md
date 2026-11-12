# Plan 103: `preset: 'prod'` costs close to the default per request

## Why this matters

`preset: 'prod'` turns on `autoRedact`. With it on, every log line redacted a full copy of the request: each header went through key-name checks and seven regexes, and a changed header built a `new Request`. No sink reads the headers except the `{ip}` token. A user who picks the production preset paid about five times the default per request.

## Evidence

In-process harness, process CPU per request (the machine runs under a shared 2-CPU cgroup quota, so wall time measured throttling). Each run alternates baseline and candidate in one process. The request is `GET /api/users/42?page=2` with 8 browser-like headers, including `authorization` and `cookie`.

- Baseline prod: median 80.0 µs, range 77.5 to 88.5, 9 rounds.
- Default config: median 16.6 µs, range 16.0 to 18.2.
- A profile of prod showed the IPv4 and IPv6 regexes at 19% of samples, plus `Request` and `Headers` construction from the header copy.

## Change

1. `redactRequest` returns `{ url, method, headers }` (`LoggedRequest`). It redacts the URL and method at once and the headers on first read of `headers`. The sinks (`formatLogOutput`, `logToFile`, `logToTransports`) take `LoggedRequest`. Measured: 77.9 to 46.5 µs.
2. `redactString` runs each built-in regex only when the text holds something every match must contain (`://`, `@`, `.`, `:`, `eyJ`, `earer` or `asic`, or at least 13 code units for card numbers). Each check has a one-line proof comment. Measured: 47.4 to 35.7 µs.
3. `redactRequestUrl` assigns `pathname` only when a segment changed. Measured: 34.2 to 32.8 µs, lower in 7 of 7 paired rounds. Skipping the `hostname` and `hash` assignments was tried and dropped. Both setters normalise some URLs (`foo:/a` becomes `foo:///a`, a bare `#` is dropped), so skipping them changes output.

Final: prod median 30.8 µs, range 29.9 to 37.0, 9 rounds. With no request headers, 45.4 to 30.4 µs.

What limits the rest. Prod with `autoRedact: false` is 20.4 µs and prod with `requestId: false` is 27.4 µs. Both off match the default. The remaining redaction cost is mostly URL parsing and re-serialising in `redactRequestUrl`. The request id costs about 6.5 µs (`randomUUID` and the header write).

## Verification

- `__tests__/utils/redact-table.test.ts` pins `redactString`, `redact` and `redactRequest` output for a table of inputs. The cases cover secrets at the start, middle and end, mixed case, unicode, every built-in pattern, headers redacted by name, and the two URL normalisation cases. It passes on the unchanged source and after the change.
- `__tests__/plugin/redacted-request-consumers.test.ts` checks the console line with `{ip}`, the transport payload and the file line under `preset: 'prod'`. With the header getter returning raw headers, it fails with `203.0.113.7` in the line.
- A scratch differential fuzzer compared baseline and candidate output on 375k generated strings and 15k requests with zero mismatches. It catches a weaker card prefilter (`\d{4}` or `\d[ -]\d`) with 26k mismatches.
- `bun run lint`, `bun run typecheck`, `cd packages/logixlysia && bun run build && bun test`.

## Out of scope

- Lazy-loading pino, sourcemaps, `packages/bench`.
- Any change to what gets redacted.
- The cost of `requestId: true` in the preset.
