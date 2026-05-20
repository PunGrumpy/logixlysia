import type { Logixlysia } from 'logixlysia'
import { injectTraceContext } from 'logixlysia/otel'

export const otelRouter = <App extends Logixlysia>(app: App) =>
  app
    .onRequest(({ request, store }) => {
      injectTraceContext(store.logger, request)
    })
    .get(
      '/trace',
      () => ({
        ok: true,
        note: 'When @opentelemetry/api is installed and a span is active, trace_id / span_id appear in logs'
      }),
      {
        detail: {
          summary: 'OpenTelemetry trace correlation',
          description:
            'Runs `injectTraceContext` on each request. Install `@opentelemetry/api` and your tracer for live trace IDs.',
          tags: ['logging', 'otel']
        }
      }
    )
