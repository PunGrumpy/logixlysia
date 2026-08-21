---
'logixlysia': minor
---

Add the `logixlysia/clickhouse` adapter. `createClickHouseTransport()` inserts logs into a ClickHouse table over the HTTP interface using `JSONEachRow` — rows carry `timestamp`, `level`, `message`, and an `attributes` map of the flattened meta. Database and table names are validated as plain identifiers, and ISO timestamps parse via `date_time_input_format=best_effort`.
