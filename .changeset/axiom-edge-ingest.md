---
'logixlysia': minor
---

`createAxiomTransport()` accepts `edge` and `edgeUrl`, and reads `AXIOM_EDGE` and `AXIOM_EDGE_URL`, to ingest through an Axiom edge deployment at `/v1/ingest/{dataset}`. Before, the adapter always used the legacy path `/v1/datasets/{dataset}/ingest`, which Axiom documents as ingesting into US East 1. The order is `edgeUrl`, then `edge`, then `baseUrl`. Passing any of the three as an option turns off all three endpoint variables (`AXIOM_EDGE_URL`, `AXIOM_EDGE`, `AXIOM_URL`), so a `baseUrl` written in code is never overruled by the shell. An `edge` value that is not a plain domain, with an optional port, throws at creation; pass a full URL as `edgeUrl` instead.
