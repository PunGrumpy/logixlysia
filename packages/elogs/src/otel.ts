import type { GlobalLogger } from "./interfaces";

/** @public */
export interface TraceContextFields {
  span_id?: string;
  trace_id?: string;
}

interface OtelApi {
  context: { active: () => unknown };
  trace: {
    getSpan: (
      ctx: unknown
    ) => { spanContext: () => { traceId: string; spanId: string } } | undefined;
  };
}

let otelApi: OtelApi | null | undefined;

// Use a Function indirection so the TypeScript compiler does not require
// `@opentelemetry/api` to be installed at build time. The string form
// of import() is rewritten by bundlers without affecting runtime semantics.
const dynamicImport = new Function("specifier", "return import(specifier)") as (
  specifier: string
) => Promise<unknown>;

/**
 * Resolves the OTel API via dynamic import so bun's
 * `mock.module("@opentelemetry/api", ...)` intercepts it in tests, and so
 * the optional peer dep doesn't break resolution at runtime when absent.
 */
const getOtelApi = async (): Promise<OtelApi | null> => {
  if (otelApi !== undefined) {
    return otelApi;
  }
  try {
    const mod = (await dynamicImport("@opentelemetry/api")) as OtelApi;
    otelApi = mod;
  } catch {
    otelApi = null;
  }
  return otelApi;
};

/**
 * Injects active OpenTelemetry span IDs into the request context bag when
 * `@opentelemetry/api` is installed and a span is active.
 *
 * 接受 GlobalLogger —— 无需手动传 request,GlobalLogger 自己从 ALS 拿
 * (若在请求作用域外,mergeContext 为 noop + warn 一次)。
 *
 * @public
 */
export const injectTraceContext = async (
  logger: Pick<GlobalLogger, "mergeContext">
): Promise<TraceContextFields | undefined> => {
  const api = await getOtelApi();
  if (!api) {
    return;
  }

  const span = api.trace.getSpan(api.context.active());
  if (!span) {
    return;
  }

  const { traceId, spanId } = span.spanContext();
  const fields = {
    span_id: spanId,
    trace_id: traceId,
  } satisfies TraceContextFields;
  logger.mergeContext(fields);
  return fields;
};

/** @internal Reset the cached OTel API reference. Only intended for tests. */
export const __resetForTesting = (): void => {
  otelApi = undefined;
};
