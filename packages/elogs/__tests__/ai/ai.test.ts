import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";

import { createElogs, globalLogger } from "../../src";
import { mergeAIMetrics } from "../../src/ai";
import { resetGlobalLogger } from "../../src/global-logger";

describe("createElogs/ai", () => {
  beforeEach(() => {
    // 每个测试用全新 createElogs,所以必须重置 globalLogger 让新实例
    // 的 contextStore 能被 initGlobalLogger 正确接管
    resetGlobalLogger();
  });

  test("mergeAIMetrics adds ai object to access log context", async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {
      /* noop */
    });

    const app = new Elysia()
      .use(
        createElogs({
          config: {
            disableFileLogging: true,
            disableInternalLogger: true,
            transports: [{ log: transport }],
          },
        })
      )
      .get("/chat", () => {
        mergeAIMetrics(globalLogger, {
          inputTokens: 100,
          model: "claude-sonnet",
          outputTokens: 50,
          totalTokens: 150,
        });
        return "ok";
      });

    await app.handle(new Request("http://localhost/chat"));

    const meta = transport.mock.calls[0]?.[2] as
      | { context?: { ai?: Record<string, unknown> } }
      | undefined;
    expect(meta?.context?.ai).toMatchObject({
      model: "claude-sonnet",
      totalTokens: 150,
    });
  });

  test("all AIMetrics fields are preserved in context", async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {
      /* noop */
    });

    const allMetrics = {
      calls: 3,
      finishReason: "stop",
      inputTokens: 200,
      model: "gpt-4o",
      msToFinish: 1200,
      msToFirstChunk: 80,
      outputTokens: 400,
      provider: "openai",
      reasoningTokens: 50,
      tokensPerSecond: 120,
      totalTokens: 650,
    };

    const app = new Elysia()
      .use(
        createElogs({
          config: {
            disableFileLogging: true,
            disableInternalLogger: true,
            transports: [{ log: transport }],
          },
        })
      )
      .get("/all-fields", () => {
        mergeAIMetrics(globalLogger, allMetrics);
        return "ok";
      });

    await app.handle(new Request("http://localhost/all-fields"));

    const meta = transport.mock.calls[0]?.[2] as
      | { context?: { ai?: Record<string, unknown> } }
      | undefined;
    expect(meta?.context?.ai).toEqual(allMetrics);
  });

  test("empty metrics object is a no-op", async () => {
    const transport = mock<
      (lvl: unknown, msg: unknown, meta?: unknown) => void
    >(() => {
      /* noop */
    });

    const app = new Elysia()
      .use(
        createElogs({
          config: {
            disableFileLogging: true,
            disableInternalLogger: true,
            transports: [{ log: transport }],
          },
        })
      )
      .get("/empty", () => {
        mergeAIMetrics(globalLogger, {});
        return "ok";
      });

    await app.handle(new Request("http://localhost/empty"));

    const meta = transport.mock.calls[0]?.[2] as
      | { context?: { ai?: Record<string, unknown> } }
      | undefined;
    expect(meta?.context?.ai).toBeUndefined();
  });
});
