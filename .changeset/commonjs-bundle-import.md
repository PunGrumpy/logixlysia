---
'logixlysia': patch
---

An app bundled to CommonJS, for example by esbuild with `--format=cjs` as AWS CDK's `NodejsFunction` does by default, crashed at import with `TypeError [ERR_INVALID_ARG_VALUE]` from `createRequire`. The package root has done this since 6.14.0 and `logixlysia/otel` since it was added. Such a bundle now imports, handles requests and writes console, file and `store.pino` lines, pretty printing included. Three things stay off in it: the colors of the plugin's own console lines (pretty `store.pino` lines keep theirs), gzip compression of rotated files (the rotated file is kept and the failure is reported as a rotation error) and the OpenTelemetry trace fields. The startup banner shows no version numbers there.
