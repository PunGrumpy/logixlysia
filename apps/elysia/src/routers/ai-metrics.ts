import { Elogs } from "@pori15/elogs";
import { mergeAIMetrics } from "@pori15/elogs/ai";

export const aiMetricsRouter = <App extends Elogs>(app: App) =>
  app.post(
    "/chat",
    {
      detail: {
        description:
          "Uses `mergeAIMetrics` from `createElogs/ai` so LLM usage appears in the request context tree.",
        summary: "AI metrics on access log",
        tags: ["logging", "ai"],
      },
    },
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
    }
  );
