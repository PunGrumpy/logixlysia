---
name: verify-logixlysia
description: Run a real Elysia server with the logixlysia plugin built from this checkout, send it HTTP requests on 127.0.0.1, and capture the log lines, response, files written and exit as proof. Use to verify or review a change to logging output, the access line, log.* calls, logFilter, sampling, file logging or request IDs the way an app using the plugin sees it. Serves on a loopback ephemeral port, routes outbound HTTP to a proxy that blocks it, and needs no Docker.
---

# Verify logixlysia

logixlysia is an Elysia plugin. A user adds `.use(logixlysia())` to an app, serves HTTP, and reads the lines on stdout, stderr and in log files. This skill runs that same path through one helper, `control-logixlysia.ts`. You write a small app module, the helper serves it on a loopback port with the plugin from `packages/logixlysia/dist`, sends the requests you list, stops the server, and records everything it saw.

Run every command from the repository root. Set the helper path once:

```sh
C=.agents/skills/verify-logixlysia/scripts/control-logixlysia.ts
RUN=my-change   # letters, digits, - and _; default "default"
```

## Safety contract

The helper sets these up for every server it starts, so keep every server inside `$C run`. The listen and network rules are checks on an app written in good faith, not a sandbox.

- **Own work directory only.** The app file must resolve inside the run's `work/`, after following symlinks. A file elsewhere is refused.
- **Loopback, ephemeral port.** The app must export its Elysia instance and must not call `.listen()`. The helper listens on `127.0.0.1` port `0`, so it never takes a port another process uses and is never reachable from outside. The check reads the app file for a `.listen(` call. It does not see one in an imported module, a bracket call such as `app['listen']()`, or `Bun.serve`, so write none of those.
- **No network.** The server gets `HTTP_PROXY` and `HTTPS_PROXY` pointing at a loopback proxy that answers every request with 403. The evidence lists each blocked target (`CONNECT example.com:443 HTTP/1.1`). The built-in adapters and transports send with `fetch`, which goes through the proxy, so they deliver nothing to a remote host. Two things skip the proxy and are not recorded: a `fetch` to `127.0.0.1` or `localhost`, which `NO_PROXY` sends direct, and a raw socket (`node:net`, UDP, DNS). Do not point the app at a loopback service or open a socket in it.
- **Clean environment.** The server gets only `PATH`, a throwaway `HOME`, `XDG_*` and `TMPDIR` under the run, and `NO_COLOR=1`. stdin is closed.
- **Kill only what it started.** `run` stops its own child with SIGTERM, then SIGKILL after 10 s. `down` kills a leftover server only when its PID is in the run's state file and its command line is the helper's serve command for this run, read from `/proc` or from `ps`. A PID whose command line cannot be read is left alone. Nothing is killed by name.

A refusal prints `control-logixlysia: refused: <why>` and exits 64 without starting anything.

## Launch

```sh
bun install --frozen-lockfile                 # once per checkout
(cd packages/logixlysia && bun run build)     # after every source change
$C up --run "$RUN"
```

`up` prints:

```text
ready <run>
work <tmp>/lgxverify/runs/<run>/work
evidence <tmp>/lgxverify/evidence/<run>
```

`up` creates `work/node_modules/logixlysia`, a link to `packages/logixlysia` (its `exports` point at `dist/`), and `work/node_modules/elysia`, a link to the Elysia the package resolves. An app in `work/` imports both by their normal names. `up` on a live run changes nothing. Runs with different names are independent, so two agents must never share one. `LGXVERIFY_ROOT` moves the tree away from `$TMPDIR/lgxverify`.

There is no long-lived server. Each `run` starts one, uses it, and stops it.

## Doctor

Run this first, and again whenever anything looks off. It only reads.

```sh
$C doctor --run "$RUN"
```

Each line starts with `ok`, `FAIL` or `info`. It checks the run is up, both links point into this checkout, `dist/index.js` exists, `dist/` is newer than every file in `packages/logixlysia/src`, and no server from this run is still alive. It reports the repo `HEAD`, Bun, Elysia and logixlysia versions. A stale `dist/` is a FAIL, because a run against it proves the last build, not your change. Exit 0 means every check passed.

## Drive

Write the app into `work/`, then run it:

```sh
cat > <work>/app.ts <<'EOF'
import { Elysia } from 'elysia'
import logixlysia from 'logixlysia'

export default new Elysia()
  .use(logixlysia({ config: { consoleFormat: 'json' } }))
  .get('/users/:id', ({ log, params }) => {
    log.mergeContext({ userId: params.id })
    return { id: params.id }
  })
EOF
$C run --run "$RUN" --app app.ts --req 'GET /users/42' --req 'GET /missing'
```

- `--app <file>` is relative to `work/`. The module exports the app as `default` or `app`.
- `--req "<METHOD> <path> [body]"` repeats and is sent in order. A body that starts with `{` or `[` goes out as JSON.
- `--header "<Name>: <value>"` repeats and goes on every request.
- `--settle-ms <n>` waits after the last response before the stop (default 300). Raise it for async sinks.
- `--label <slug>` names the evidence file.

`run` prints the report and exits 0 when the server became ready, every request got a response and the server stopped. It exits 1 otherwise. The exit code says the scenario ran, not that the logs are right. Assert the lines yourself.

To test a change, drive the recipes it touches from [`features/`](features/README.md), then drive a neighbor it should not touch. Run the same recipe on the base commit when you need a before and after.

## Evidence

Each `run` writes two files to `<evidence>/`:

- `<NN>-<label>.txt` holds the command, repo `HEAD`, versions, the app source, each request with status, `x-request-id` and body, the server's stdout and stderr, how it stopped, the blocked outbound requests, and the content of every file under `work/` written during the run.
- `<NN>-<label>.stdout.log` is the raw stdout, so JSON lines parse with `jq` or `bun -e`.

`index.tsv` gets one row per run with the time, `ok` or `FAIL`, the file and the command. Paths are rewritten to `$WORK`, `$REPO` and `~`, so the report can be pasted into a PR. Evidence lives outside the run directory, so `down` keeps it.

Proof standards:

- Show the input and the result. The report includes the app source; quote it with the lines.
- Parse JSON lines and assert fields. Don't grep the pretty text line for numbers.
- `INFO` lines go to stdout, `WARN` and `ERROR` to stderr. Check the right stream.
- A file sink is proven by the `--- file` section, written by the server, not by a unit test.
- A fix needs two proofs. The broken case now behaves, and a neighbor that already worked still does. When the changed code has no caller a user can reach, say so and prove the neighbor only.

## Cleanup

```sh
$C down --run "$RUN"
```

`down` kills a server this run left behind, deletes `runs/<run>`, and prints the evidence folder it kept. Run it after every failed attempt too. Delete evidence by hand once it is in the PR.

## Helpers

- `scripts/control-logixlysia.ts` runs `up`, `doctor`, `run` and `down` as shown above. Run it directly; it needs Bun. Its `__serve` action is internal to `run` and refuses to start on its own.
- `scripts/tsconfig.json` gives the type-aware lint the Bun types for the helper.
