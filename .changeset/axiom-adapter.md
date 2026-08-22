---
'logixlysia': minor
---

Add the `logixlysia/axiom` adapter. `createAxiomTransport()` ships logs to an Axiom dataset via the ingest API with batching, retries, and env-based credentials (`AXIOM_API_KEY`, `AXIOM_DATASET`, `AXIOM_ORG_ID`, `AXIOM_URL`). Events keep their nested structure so every field is queryable with APL.
