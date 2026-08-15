[**@pori15/elogs**](../README.md)

***

[@pori15/elogs](../README.md) / mergeAIMetrics

# Function: mergeAIMetrics()

> **mergeAIMetrics**(`logger`, `metrics`): `void`

Defined in: [packages/elogs/src/ai.ts:32](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/ai.ts#L32)

Merges AI SDK / LLM usage metrics into the request context bag so they appear
on the final access log (evlog-style `ai` object).

接受 GlobalLogger —— 无需手动传 request,GlobalLogger 自己从 ALS 拿
(若在请求作用域外,mergeContext 为 noop + warn 一次)。

## Parameters

### logger

`Pick`\<[`GlobalLogger`](../interfaces/GlobalLogger.md), `"mergeContext"`\>

### metrics

[`AIMetrics`](../interfaces/AIMetrics.md)

## Returns

`void`
