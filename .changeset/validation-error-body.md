---
'createElogs': minor
---

Validation errors no longer log the submitted request body (`found`/`errors`) by default — messages are normalized to the failed paths only. Set `config.logErrorPayload: true` to restore payload logging. Raw Error objects are no longer passed into transport meta.
