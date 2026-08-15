import { CreateElogs } from "@pori15/elogs";
import { mergeAIMetrics } from "@pori15/elogs/ai";

export const aiMetricsRouter = <App extends CreateElogs>(app: App) =>
  app.post(
    "/chat",
    {
      detail: {},
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
