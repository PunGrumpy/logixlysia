import { Elysia } from "elysia";

import { createElogs, globalLogger } from "../../src";
import { mergeAIMetrics } from "../../src/ai";
import type { CreateElogsOptions } from "../../src/interfaces";
import { injectTraceContext } from "../../src/otel";

export type TransportLog = (lvl: unknown, msg: unknown, meta?: unknown) => void;

/** Mirrors apps/elysia demo routes for integration tests (no cross-package import). */
export const createDemoApp = (options: CreateElogsOptions) => {
  const logging = createElogs(options);

  return new Elysia()
    .use(logging)
    .get("/", () => ({ message: "ok" }))
    .get("/checkout", () => {
      globalLogger.mergeContext({ userId: "usr_test" });
      globalLogger.mergeContext({ cart: { items: 1, total: 100 } });
      return { ok: true };
    })
    .post("/chat", () => {
      mergeAIMetrics(globalLogger, {
        inputTokens: 10,
        model: "test-model",
        outputTokens: 5,
        totalTokens: 15,
      });
      return { ok: true };
    })
    .request(() => {
      injectTraceContext(globalLogger);
    })
    .get("/trace", () => ({ ok: true }))
    .get("/status/:code", ({ params, set }) => {
      const code = Number(params.code);
      set.status =
        Number.isInteger(code) && code >= 200 && code <= 599 ? code : 400;
      return { status: set.status };
    })
    .get("/status/name/:name", ({ params, set }) => {
      set.status = decodeURIComponent(params.name) as never; // e.g. "Not Found" — exercises string statuses
      return { status: set.status };
    });
};

export const silentTestOptions = (
  transport: TransportLog
): CreateElogsOptions => ({
  config: {
    disableFileLogging: true,
    disableInternalLogger: true,
    pino: { enabled: false },
    transports: [{ log: transport }],
  },
  preset: "dev",
});
