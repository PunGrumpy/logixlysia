[**@pori15/elogs**](../README.md)

***

[@pori15/elogs](../README.md) / injectTraceContext

# Function: injectTraceContext()

> **injectTraceContext**(`logger`): `Promise`\<[`TraceContextFields`](../interfaces/TraceContextFields.md) \| `undefined`\>

Defined in: [packages/elogs/src/otel.ts:54](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/otel.ts#L54)

Injects active OpenTelemetry span IDs into the request context bag when
`@opentelemetry/api` is installed and a span is active.

接受 GlobalLogger —— 无需手动传 request,GlobalLogger 自己从 ALS 拿
(若在请求作用域外,mergeContext 为 noop + warn 一次)。

## Parameters

### logger

`Pick`\<[`GlobalLogger`](../interfaces/GlobalLogger.md), `"mergeContext"`\>

## Returns

`Promise`\<[`TraceContextFields`](../interfaces/TraceContextFields.md) \| `undefined`\>
