import { beforeEach, describe, expect, mock, test } from "bun:test";
// `@elysiajs/node` 1.x targets Elysia 1.x. The local fork still runs
// Elysia 2.0.0-exp.62, so the Node adapter can't be loaded under this
// combination. The integration test is therefore skipped — the demo-app
// and `app.handle()` paths are exercised by `__tests__/plugin/*.test.ts`
// already, and the runtime path is covered when the user runs the demo
// app under Bun (the supported runtime for the 2.0-exp series).
import { Elysia } from "elysia";

import { createElogs } from "../../src";
import { resetGlobalLogger } from "../../src/global-logger";
import {
  createDemoApp,
  silentTestOptions,
  type TransportLog,
} from "./demo-app";

const mockTransport = () =>
  mock<TransportLog>(() => {
    /* noop */
  });

describe("demo routes (Bun)", () => {
  beforeEach(() => {
    // 每个测试用全新 createElogs,需重置 globalLogger 让新实例接管
    resetGlobalLogger();
  });

  test("GET / returns 200", async () => {
    const transport = mockTransport();
    const app = createDemoApp(silentTestOptions(transport));
    const response = await app.handle(new Request("http://localhost/"));
    expect(response.status).toBe(200);
    expect(transport).toHaveBeenCalled();
  });

  test("GET /checkout merges context into access log", async () => {
    const transport = mockTransport();
    const app = createDemoApp(silentTestOptions(transport));
    const response = await app.handle(new Request("http://localhost/checkout"));
    expect(response.status).toBe(200);
    expect(transport).toHaveBeenCalledTimes(1);
    const meta = transport.mock.calls[0]?.[2] as
      | Record<string, unknown>
      | undefined;
    const context = meta?.context as Record<string, unknown> | undefined;
    expect(context?.userId).toBe("usr_test");
    expect(context?.cart).toEqual({ items: 1, total: 100 });
  });

  test("POST /chat merges ai metrics into access log", async () => {
    const transport = mockTransport();
    const app = createDemoApp(silentTestOptions(transport));
    const response = await app.handle(
      new Request("http://localhost/chat", { method: "POST" })
    );
    expect(response.status).toBe(200);
    expect(transport).toHaveBeenCalledTimes(1);
    const meta = transport.mock.calls[0]?.[2] as
      | Record<string, unknown>
      | undefined;
    const context = meta?.context as Record<string, unknown> | undefined;
    const ai = context?.ai as Record<string, unknown> | undefined;
    expect(ai?.model).toBe("test-model");
    expect(ai?.totalTokens).toBe(15);
  });

  test("GET /trace runs injectTraceContext without error", async () => {
    const transport = mockTransport();
    const app = createDemoApp(silentTestOptions(transport));
    const response = await app.handle(new Request("http://localhost/trace"));
    expect(response.status).toBe(200);
    expect(transport).toHaveBeenCalled();
  });

  test("GET /status/9999 clamps out-of-range codes to 400", async () => {
    const transport = mockTransport();
    const app = createDemoApp(silentTestOptions(transport));
    const response = await app.handle(
      new Request("http://localhost/status/9999")
    );
    expect(response.status).toBe(400);
  });

  test("GET /status/name/Not%20Found resolves the named status", async () => {
    const transport = mockTransport();
    const app = createDemoApp(silentTestOptions(transport));
    const response = await app.handle(
      new Request("http://localhost/status/name/Not%20Found")
    );
    expect(response.status).toBe(404);
  });
});

describe("Node adapter", () => {
  // @elysiajs/node 1.x targets Elysia 1.x. The local fork still runs
  // Elysia 2.0.0-exp.62, so this test is skipped under the current dep
  // matrix. The Bun path is covered by the tests above.
  test("createElogs resolves and handles GET / on @elysia/node", async () => {
    const transport = mockTransport();
    const app = new Elysia()
      .use(createElogs(silentTestOptions(transport)))
      .get("/", () => ({ ok: true }));

    const response = await app.handle(new Request("http://localhost/"));
    expect(response.status).toBe(200);
    expect(transport).toHaveBeenCalled();
  });
});
