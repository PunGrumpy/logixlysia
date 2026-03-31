---
"logixlysia": patch
---

Fix log rotation reliability and safety issues by serializing concurrent file operations, making cleanup resilient to partial failures, improving file-operation error visibility, hardening URL parsing/compression paths, and preventing rotated filename collisions under high concurrency.
