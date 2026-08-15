[**@pori15/elogs**](../README.md)

***

[@pori15/elogs](../README.md) / pino

# Variable: pino

> **pino**: `Pino`

Defined in: [packages/elogs/src/global-logger.ts:148](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/global-logger.ts#L148)

顶层 pino 导出 —— 直接拿到底层 pino 实例,**不需要**请求作用域。

适用于:
- 模块初始化时的 banner / startup log
- 后台任务、调度任务、WebSocket 关闭钩子等无 request 场景
- DB 层独立调用(不经过 Elysia handler)

必须在 `initGlobalLogger()` 或 `createElogs()` 调用之后访问,否则为 undefined。

## Example

```ts
import { pino } from "@pori15/elogs";
pino.info("module loaded");
```
