import type { CreateElogs } from "@pori15/elogs";
import { injectTraceContext } from "@pori15/elogs/otel";

export const otelRouter = <App extends CreateElogs>(app: App) =>
  app
    .request(({ request, store }) => {
      injectTraceContext(store.logger, request);
    })
    .get("/trace", {}, () => ({
      note: "When @opentelemetry/api is installed and a span is active, trace_id / span_id appear in logs",
      ok: true,
    }));
