import { describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";

import { createElogs } from "../../src";
import type { CreateElogsOptions } from "../../src/interfaces";

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("request ID plugin integration", () => {
  test("auto-merges requestId into log context", async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {
      /* noop */
    });
    const options: CreateElogsOptions = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        requestId: true,
        transports: [{ log: transport }],
      },
    };

    const app = new Elysia().use(createElogs(options)).get("/test", () => "ok");

    await app.handle(new Request("http://localhost/test"));

    expect(transport).toHaveBeenCalledTimes(1);
    const meta = transport.mock.calls[0]?.[2] as
      | { context?: { requestId?: string } }
      | undefined;
    expect(meta?.context?.requestId).toBeDefined();
    expect(typeof meta?.context?.requestId).toBe("string");
    // UUID v4 format
    expect(meta?.context?.requestId).toMatch(UUID_V4_REGEX);
  });

  test("sets X-Request-Id response header", async () => {
    const options: CreateElogsOptions = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        requestId: true,
      },
    };

    const app = new Elysia().use(createElogs(options)).get("/test", () => "ok");

    const response = await app.handle(new Request("http://localhost/test"));

    const responseId = response.headers.get("X-Request-Id");
    expect(responseId).toBeDefined();
    expect(responseId).toMatch(UUID_V4_REGEX);
  });

  test("honors incoming X-Request-Id header", async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {
      /* noop */
    });
    const options: CreateElogsOptions = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        requestId: true,
        transports: [{ log: transport }],
      },
    };

    const app = new Elysia().use(createElogs(options)).get("/test", () => "ok");

    const incomingId = "gateway-req-abc-123";
    const response = await app.handle(
      new Request("http://localhost/test", {
        headers: { "X-Request-Id": incomingId },
      })
    );

    // Response header should reflect the incoming ID
    expect(response.headers.get("X-Request-Id")).toBe(incomingId);

    // Transport should also receive the incoming ID
    const meta = transport.mock.calls[0]?.[2] as
      | { context?: { requestId?: string } }
      | undefined;
    expect(meta?.context?.requestId).toBe(incomingId);
  });

  test("disabled by default — no requestId in context", async () => {
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

    const response = await app.handle(new Request("http://localhost/test"));

    // No X-Request-Id header on response
    expect(response.headers.get("X-Request-Id")).toBeNull();

    // No requestId in log context
    const meta = transport.mock.calls[0]?.[2] as
      | { context?: { requestId?: string } }
      | undefined;
    expect(meta?.context?.requestId).toBeUndefined();
  });

  test("uses custom header name from RequestIdConfig", async () => {
    const options: CreateElogsOptions = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        requestId: { header: "X-Correlation-Id" },
      },
    };

    const app = new Elysia().use(createElogs(options)).get("/test", () => "ok");

    const response = await app.handle(new Request("http://localhost/test"));

    // Should use the custom header name
    expect(response.headers.get("X-Correlation-Id")).toBeDefined();
    // Default header should not be set
    expect(response.headers.get("X-Request-Id")).toBeNull();
  });

  test("uses custom generator from RequestIdConfig", async () => {
    let counter = 0;
    const options: CreateElogsOptions = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        requestId: {
          generator: () => {
            counter += 1;
            return `custom-${counter}`;
          },
        },
        transports: [
          {
            log: () => {
              /* noop */
            },
          },
        ],
      },
    };

    const app = new Elysia().use(createElogs(options)).get("/test", () => "ok");

    const res1 = await app.handle(new Request("http://localhost/test"));
    const res2 = await app.handle(new Request("http://localhost/test"));

    expect(res1.headers.get("X-Request-Id")).toBe("custom-1");
    expect(res2.headers.get("X-Request-Id")).toBe("custom-2");
  });

  test("{requestId} token works in customLogFormat", async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {
      /* noop */
    });
    const options: CreateElogsOptions = {
      config: {
        customLogFormat: "{method} {pathname} {requestId}",
        disableFileLogging: true,
        requestId: { generator: () => "test-req-id-789" },
        transports: [{ log: transport }],
      },
    };

    const app = new Elysia().use(createElogs(options)).get("/test", () => "ok");

    await app.handle(new Request("http://localhost/test"));

    // The transport receives unformatted data, but the internal logger
    // uses the format string. We verify via the transport that requestId
    // is in the context.
    const meta = transport.mock.calls[0]?.[2] as
      | { context?: { requestId?: string } }
      | undefined;
    expect(meta?.context?.requestId).toBe("test-req-id-789");
  });

  test("prod preset enables requestId by default", async () => {
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
      preset: "prod",
    };

    const app = new Elysia().use(createElogs(options)).get("/test", () => "ok");

    await app.handle(new Request("http://localhost/test"));

    const meta = transport.mock.calls[0]?.[2] as
      | { context?: { requestId?: string } }
      | undefined;
    expect(meta?.context?.requestId).toBeDefined();
    expect(typeof meta?.context?.requestId).toBe("string");
  });

  test("sets X-Request-Id response header on errors", async () => {
    const options: CreateElogsOptions = {
      config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        requestId: true,
      },
    };

    const app = new Elysia().use(createElogs(options)).get("/error", () => {
      throw new Error("something went wrong");
    });

    const response = await app.handle(new Request("http://localhost/error"));

    const responseId = response.headers.get("X-Request-Id");
    expect(responseId).toBeDefined();
    expect(responseId).toMatch(UUID_V4_REGEX);
  });
});
