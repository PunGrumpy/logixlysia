---
'logixlysia': minor
---

Add head + tail sampling via `config.sampling`. Head sampling keeps a percentage of records per level (`{ INFO: 10 }`; levels left out keep everything), so log spend stops scaling one-for-one with traffic. Tail sampling buffers what head dropped and replays it when the finished request matches `status`, `durationMs`, or a path glob — failures and slow paths keep their full log trail instead of losing nine lines in ten. Dropped records skip context merging, redaction, formatting, and every sink; replayed ones keep the duration they had when captured.
