import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";

import { createElogs, globalLogger } from "../../src";
import { resetGlobalLogger } from "../../src/global-logger";
import type { CreateElogsOptions } from "../../src/interfaces";

describe("createElogs request context", () => {
  beforeEach(() => {
    // 每个测试用全新 createElogs,需重置 globalLogger 让新实例接管
    resetGlobalLogger();
  });

  test("merges accumulated context into auto access log", async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {
      /* noop */
    });
    const options: CreateElogsOptions = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        transports: [{ log: transport }],
      },
    };

    const app = new Elysia().use(createElogs(options)).get("/test", () => {
      globalLogger.mergeContext({ userId: "u1" });
      return "ok";
    });

    await app.handle(new Request("http://localhost/test"));

    expect(transport).toHaveBeenCalledTimes(1);
    const meta = transport.mock.calls[0]?.[2] as
      | Record<string, unknown>
      | undefined;
    expect(meta?.context).toEqual({ userId: "u1" });
  });

  test("custom log merges accumulated context; explicit context wins on collision", async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {
      /* noop */
    });
    const options: CreateElogsOptions = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        transports: [{ log: transport }],
      },
    };

    const app = new Elysia().use(createElogs(options)).get("/test", () => {
      globalLogger.mergeContext({
        plan: "pro",
        userId: "accumulated",
      });
      globalLogger.info("custom", { userId: "override" });
      return "ok";
    });

    await app.handle(new Request("http://localhost/test"));

    expect(transport).toHaveBeenCalledTimes(1);
    const meta = transport.mock.calls[0]?.[2] as
      | Record<string, unknown>
      | undefined;
    expect(meta?.context).toEqual({ plan: "pro", userId: "override" });
  });

  test("autoRedact applies to merged request context", async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {
      /* noop */
    });
    const options: CreateElogsOptions = {
      config: {
        autoRedact: true,
        disableFileLogging: true,
        disableInternalLogger: true,
        transports: [{ log: transport }],
      },
    };

    const app = new Elysia().use(createElogs(options)).get("/test", () => {
      globalLogger.mergeContext({
        email: "secret@example.com",
      });
      return "ok";
    });

    await app.handle(new Request("http://localhost/test"));

    const meta = transport.mock.calls[0]?.[2] as
      | { context?: { email?: string } }
      | undefined;
    expect(meta?.context?.email).toBe("[REDACTED]");
  });

  test("does not allocate context field when bag is empty", async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {
      /* noop */
    });
    const options: CreateElogsOptions = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        transports: [{ log: transport }],
      },
    };

    const app = new Elysia().use(createElogs(options)).get("/test", () => "ok");

    await app.handle(new Request("http://localhost/test"));

    const meta = transport.mock.calls[0]?.[2] as
      | Record<string, unknown>
      | undefined;
    expect(meta?.context).toBeUndefined();
  });
});
