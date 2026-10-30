---
'logixlysia': patch
---

A tail-sampling glob with more than two single `*` wildcards in one path segment is now rejected at startup, and path rules skip pathnames longer than 2048 characters, so a crafted URL can no longer pin the event loop in the matcher. `userAgentEnricher` parses at most the first 512 characters of the header.
