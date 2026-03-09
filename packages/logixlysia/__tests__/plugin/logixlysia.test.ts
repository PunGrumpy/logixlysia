import { describe, expect, mock, test } from "bun:test";

import { Elysia } from "elysia";

import { logixlysia } from "../../src";
import type { Options } from "../../src/interfaces";

describe("logixlysia plugin", () => {
  test("auto-logs once when no custom log was emitted", async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {
      /* noop */
    });
    const options: Options = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        transports: [{ log: transport }],
      },
    };

    const app = new Elysia().use(logixlysia(options)).get("/test", () => "ok");

    await app.handle(new Request("http://localhost/test"));

    expect(transport).toHaveBeenCalledTimes(1);
    const [levelValue] = transport.mock.calls[0] ?? [undefined];
    expect(levelValue).toBe("INFO");
  });

  test("does not duplicate logs when a custom log is emitted", async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {
      /* noop */
    });
    const options: Options = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        transports: [{ log: transport }],
      },
    };

    const app = new Elysia()
      .use(logixlysia(options))
      .get("/test", ({ request, store }) => {
        store.logger.info(request, "custom");
        return "ok";
      });

    await app.handle(new Request("http://localhost/test"));

    expect(transport).toHaveBeenCalledTimes(1);
    const [levelValue, messageValue] = transport.mock.calls[0] ?? [
      undefined,
      undefined,
    ];
    expect(levelValue).toBe("INFO");
    expect(messageValue).toBe("custom");
  });

  test("logs errors through transports on exceptions", async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {
      /* noop */
    });
    const options: Options = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        transports: [{ log: transport }],
      },
    };

    const app = new Elysia().use(logixlysia(options)).get("/boom", () => {
      throw new Error("boom");
    });

    await app.handle(new Request("http://localhost/boom"));

    const levels = transport.mock.calls.map((call) => call[0]);
    expect(levels).toContain("ERROR");
  });

  test("filters logs by level when logFilter is configured", async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {
      /* noop */
    });
    const options: Options = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        logFilter: {
          level: ["ERROR", "WARNING"],
        },
        transports: [{ log: transport }],
      },
    };

    const app = new Elysia().use(logixlysia(options)).get("/test", () => "ok");

    await app.handle(new Request("http://localhost/test"));

    // Should not log INFO level requests when filter only allows ERROR and WARNING
    expect(transport).toHaveBeenCalledTimes(0);
  });

  test("allows all log levels when logFilter is not configured", async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {
      /* noop */
    });
    const options: Options = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        transports: [{ log: transport }],
      },
    };

    const app = new Elysia().use(logixlysia(options)).get("/test", () => "ok");

    await app.handle(new Request("http://localhost/test"));

    // Should log INFO level when no filter is applied
    expect(transport).toHaveBeenCalledTimes(1);
    const [levelValue] = transport.mock.calls[0] ?? [undefined];
    expect(levelValue).toBe("INFO");
  });

  test("filters custom logs by level", async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {
      /* noop */
    });
    const options: Options = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        logFilter: {
          level: ["ERROR"],
        },
        transports: [{ log: transport }],
      },
    };

    const app = new Elysia()
      .use(logixlysia(options))
      .get("/test", ({ request, store }) => {
        store.logger.info(request, "custom info"); // Should be filtered out
        store.logger.error(request, "custom error"); // Should be allowed
        return "ok";
      });

    await app.handle(new Request("http://localhost/test"));

    expect(transport).toHaveBeenCalledTimes(1);
    const [levelValue] = transport.mock.calls[0] ?? [undefined];
    expect(levelValue).toBe("ERROR");
  });

  test("allows all levels when logFilter.level is empty", async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {
      /* noop */
    });
    const options: Options = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        logFilter: {
          level: [],
        },
        transports: [{ log: transport }],
      },
    };

    const app = new Elysia().use(logixlysia(options)).get("/test", () => "ok");

    await app.handle(new Request("http://localhost/test"));

    // Should log INFO level when filter level array is empty
    expect(transport).toHaveBeenCalledTimes(1);
    const [levelValue] = transport.mock.calls[0] ?? [undefined];
    expect(levelValue).toBe("INFO");
  });

  test("logFilter suppresses HTTP error logs when ERROR level is excluded", async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {
      /* noop */
    });
    const options: Options = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        logFilter: {
          level: ["INFO", "WARNING"],
        },
        transports: [{ log: transport }],
      },
    };

    const app = new Elysia().use(logixlysia(options)).get("/boom", () => {
      throw new Error("boom");
    });

    await app.handle(new Request("http://localhost/boom"));

    // ERROR-level HTTP exceptions must be suppressed when filtered out
    expect(transport).toHaveBeenCalledTimes(0);
  });

  test("logFilter allows HTTP error logs when ERROR level is included", async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {
      /* noop */
    });
    const options: Options = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        logFilter: {
          level: ["ERROR"],
        },
        transports: [{ log: transport }],
      },
    };

    const app = new Elysia().use(logixlysia(options)).get("/boom", () => {
      throw new Error("boom");
    });

    await app.handle(new Request("http://localhost/boom"));

    // ERROR-level HTTP exceptions must be logged when ERROR is in the allowed levels
    expect(transport).toHaveBeenCalledTimes(1);
    const [levelValue] = transport.mock.calls[0] ?? [undefined];
    expect(levelValue).toBe("ERROR");
  });
});
