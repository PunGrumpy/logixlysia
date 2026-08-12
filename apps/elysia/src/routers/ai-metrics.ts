import type { Logixlysia } from "logixlysia";
import { mergeAIMetrics } from "logixlysia/ai";

export const aiMetricsRouter = <App extends Logixlysia>(app: App) =>
  app.post(
    "/chat",
    ({ request, store }) => {
      mergeAIMetrics(store.logger, request, {
        inputTokens: 1200,
        model: "demo-model",
        msToFinish: 890,
        outputTokens: 320,
        provider: "example",
        totalTokens: 1520,
      });
      return {
        ok: true,
        reply: "Demo response — check access log for `context.ai`",
      };
    },
    {
      detail: {
        description:
          "Uses `mergeAIMetrics` from `logixlysia/ai` so LLM usage appears in the request context tree.",
        summary: "AI metrics on access log",
        tags: ["logging", "ai"],
      },
    }
  );
