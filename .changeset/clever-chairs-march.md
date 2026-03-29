---
"logixlysia": patch
---

Fix log rotation reliability and safety issues by serializing concurrent file operations, making cleanup resilient to partial failures, improving file-operation error visibility, and hardening URL parsing/compression paths.
