---
'logixlysia': minor
---

Add the `logixlysia/posthog` adapter. `createPostHogTransport()` captures logs as PostHog events via the batch API (`POSTHOG_API_KEY`, `POSTHOG_HOST` for EU/self-hosted). Meta fields become dot-notation event properties, and logs carrying a `userId` in the request context are linked to PostHog persons via `distinct_id`.
