---
'logixlysia': minor
---

`preset: 'prod'` and `preset: 'json'` now print one line of JSON per record, as the docs promised, instead of the text line with its fox emoji. Loki, Datadog and CloudWatch can parse the console output without extra config:

```
{"timestamp":"2026-11-12T05:43:59.800Z","level":"INFO","message":"","request":{"method":"GET","url":"http://localhost/users/[REDACTED]"},"status":200,"durationMs":0.83,"context":{"requestId":"8623487f-c151-4ccb-ae83-3d708e541e39"}}
```

The line is the record transports receive, with an ISO-8601 `timestamp`. Newlines in values are escaped, and `autoRedact` masks it as it masks the text line. A new option, `consoleFormat: 'text' | 'json'`, picks the console output and works without a preset.

What changed for you: if you use `prod` or `json` and want the text line back, set `consoleFormat: 'text'`:

```ts
logixlysia({ preset: 'prod', config: { consoleFormat: 'text' } })
```

The default (no preset) and `preset: 'dev'` print exactly what they did before. Plain records also serialise faster for every adapter, since they skip the per-value replacer that BigInt, Error, Map, Set and cycles need.
