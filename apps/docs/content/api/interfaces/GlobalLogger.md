[**@pori15/elogs**](../README.md)

***

[@pori15/elogs](../README.md) / GlobalLogger

# Interface: GlobalLogger

Defined in: [packages/elogs/src/interfaces.ts:603](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L603)

全局 Logger,通过 `globalLogger` 导出。

- **请求作用域内**(Elysia 路由 handler / 中间件 / hook 调用栈):自动从
  AsyncLocalStorage 拿当前 request,走完整 emit 流水线(file/transports/console)。
- **请求作用域外**(模块初始化 / 后台任务 / 进程级错误兜底):降级为 pino 输出,
  首次降级时 `console.warn` 一次提示。

调用者**不需要**也不应该传 `request`。

## Example

```typescript
import { globalLogger } from "@pori15/elogs";

// 路由 handler / 中间件 / hook —— 自动走完整 emit
app.get("/user/:id", ({ params }) => {
  globalLogger.info("Fetching user", { userId: params.id });
});

// 错误处理 —— Error 实例自动 unwrap .message + .stack
try {
  await db.query();
} catch (err) {
  globalLogger.error(err);
}
```

## Properties

### debug

> **debug**: (`message`, `context?`) => `void`

Defined in: [packages/elogs/src/interfaces.ts:607](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L607)

记录 DEBUG 级别日志。作用域内走完整 emit,作用域外走 pino。

#### Parameters

##### message

`string`

##### context?

`Record`\<`string`, `unknown`\>

#### Returns

`void`

***

### error

> **error**: (`message`, `context?`) => `void`

Defined in: [packages/elogs/src/interfaces.ts:616](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L616)

记录 ERROR 级别日志。

#### Parameters

##### message

`string` \| `Error`

字符串消息,或 Error 实例(自动 unwrap `.message` + `.stack` 进 context)

##### context?

`Record`\<`string`, `unknown`\>

附加上下文。当 `message` 是 Error 时,`stack` 和 `errorName` 会被自动
  合并进 context(除非 context 显式提供同名 key,显式值优先级更高)。

#### Returns

`void`

***

### getContext

> **getContext**: () => `Readonly`\<`Record`\<`string`, `unknown`\>\>

Defined in: [packages/elogs/src/interfaces.ts:622](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L622)

读取当前请求的累积上下文(作用域内有效)。
作用域外返回 `{}`,首次调用时 `console.warn` 一次。

#### Returns

`Readonly`\<`Record`\<`string`, `unknown`\>\>

***

### info

> **info**: (`message`, `context?`) => `void`

Defined in: [packages/elogs/src/interfaces.ts:627](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L627)

记录 INFO 级别日志。作用域内走完整 emit,作用域外走 pino。

#### Parameters

##### message

`string`

##### context?

`Record`\<`string`, `unknown`\>

#### Returns

`void`

***

### mergeContext

> **mergeContext**: (`partial`) => `void`

Defined in: [packages/elogs/src/interfaces.ts:633](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L633)

合并上下文到当前请求(作用域内有效)。
作用域外为 noop,首次调用时 `console.warn` 一次。

#### Parameters

##### partial

`Record`\<`string`, `unknown`\>

#### Returns

`void`

***

### warn

> **warn**: (`message`, `context?`) => `void`

Defined in: [packages/elogs/src/interfaces.ts:638](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L638)

记录 WARNING 级别日志。作用域内走完整 emit,作用域外走 pino。

#### Parameters

##### message

`string`

##### context?

`Record`\<`string`, `unknown`\>

#### Returns

`void`
