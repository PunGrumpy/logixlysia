import type { Elogs } from "@pori15/elogs";
import { injectTraceContext } from "@pori15/elogs/otel";
import { Elysia } from "elysia";

export const otelRouter = <App extends Elogs>(app: Elysia) =>
  app
    .request(({ request, store }) => {
      injectTraceContext(store.logger, request);
    })
    .get(
      "/trace",
      {
        detail: {
          description:
            "Runs `injectTraceContext` on each request. Install `@opentelemetry/api` and your tracer for live trace IDs.",
          summary: "OpenTelemetry trace correlation",
          tags: ["logging", "otel"],
        },
      },
      () => ({
        note: "When @opentelemetry/api is installed and a span is active, trace_id / span_id appear in logs",
        ok: true,
      })
    );
