---
"logixlysia": patch
---

### Added

- Add `logFilter` configuration option to filter logs by level
- Add `LogFilter` interface with `level` property to specify allowed log levels
- Implement filtering logic in logger to prevent processing of filtered log levels
- Add comprehensive tests for log filtering functionality

### Fixed

- Fixed TypeScript error where `logFilter` property was missing in configuration type

### Changed

- Updated TypeScript interfaces to support the new `logFilter` configuration option