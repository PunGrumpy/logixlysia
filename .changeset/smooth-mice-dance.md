---
"logixlysia": patch
---

- Optimized log formatting performance by replacing multiple `.replaceAll()` calls with a single-pass regex replacement in `formatLogOutput` and `formatTimestamp`.
- Optimized `getIp` string slicing to reduce array allocations.
- Fixed a bug where padded HTTP methods (e.g., `GET    `) lost their color formatting.
- Added early bailout logic to bypass allocations and system calls when logging is effectively disabled, significantly improving disabled-state benchmark performance.