[**@pori15/elogs**](../README.md)

***

[@pori15/elogs](../README.md) / initGlobalLogger

# Function: initGlobalLogger()

> **initGlobalLogger**(`options?`, `contextStore?`): [`GlobalLogger`](../interfaces/GlobalLogger.md)

Defined in: [packages/elogs/src/global-logger.ts:169](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/global-logger.ts#L169)

Initializes the top-level `pino` + `globalLogger` exports.

## Parameters

### options?

[`CreateElogsOptions`](../interfaces/CreateElogsOptions.md) = `{}`

### contextStore?

[`RequestContextStore`](../interfaces/RequestContextStore.md) = `globalContextStore`

## Returns

[`GlobalLogger`](../interfaces/GlobalLogger.md)
