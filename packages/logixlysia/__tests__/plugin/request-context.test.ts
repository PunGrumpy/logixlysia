import { describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";

import { logixlysia } from "../../src";
import type { LogixlysiaOptions } from "../../src/interfaces";

describe("logixlysia request context", () => {
  test("merges accumulated context into auto access log", async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {
      /* noop */
    });
    const options: LogixlysiaOptions = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        transports: [{ log: transport }],
      },
    };

    const app = new Elysia()
      .use(logixlysia(options))
      .get("/test", ({ request, store }) => {
        store.logger.mergeContext(request, { userId: "u1" });
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
    const options: LogixlysiaOptions = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        transports: [{ log: transport }],
      },
    };

    const app = new Elysia()
      .use(logixlysia(options))
      .get("/test", ({ request, store }) => {
        store.logger.mergeContext(request, {
          plan: "pro",
          userId: "accumulated",
        });
        store.logger.info(request, "custom", { userId: "override" });
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
    const options: LogixlysiaOptions = {
      config: {
        autoRedact: true,
        disableFileLogging: true,
        disableInternalLogger: true,
        transports: [{ log: transport }],
      },
    };

    const app = new Elysia()
      .use(logixlysia(options))
      .get("/test", ({ request, store }) => {
        store.logger.mergeContext(request, {
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
    const options: LogixlysiaOptions = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        transports: [{ log: transport }],
      },
    };

    const app = new Elysia().use(logixlysia(options)).get("/test", () => "ok");

    await app.handle(new Request("http://localhost/test"));

    const meta = transport.mock.calls[0]?.[2] as
      | Record<string, unknown>
      | undefined;
    expect(meta?.context).toBeUndefined();
  });
});
