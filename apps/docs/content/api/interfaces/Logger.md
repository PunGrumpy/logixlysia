[**@pori15/elogs**](../README.md)

***

[@pori15/elogs](../README.md) / Logger

# Interface: Logger

Defined in: [packages/elogs/src/interfaces.ts:348](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L348)

Logger 实例，可通过 `store.logger` 访问。

提供 9 个核心方法用于日志记录、上下文管理和错误处理。
所有日志方法都接收 `Request` 对象，用于自动关联请求 ID 和链路追踪信息。

## Example

```typescript
// 在 Elysia 插件或路由中获取 Logger
app.get('/user', ({ request, store }) => {
  const logger = store.logger;
  logger.info(request, 'Fetching user data', { userId: '123' });
});
```

## Properties

### debug

> **debug**: (`request`, `message`, `context?`) => `void`

Defined in: [packages/elogs/src/interfaces.ts:361](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L361)

记录 DEBUG 级别的调试日志。

#### Parameters

##### request

`Request`

当前请求对象（必填），用于关联请求上下文

##### message

`string`

日志消息（必填），简要描述事件

##### context?

`Record`\<`string`, `unknown`\>

可选，额外的结构化上下文数据，会被合并到日志记录中

#### Returns

`void`

#### Example

```typescript
logger.debug(request, 'Cache lookup', { cacheKey: 'user:123', hit: true });
```

***

### error

> **error**: (`request`, `message`, `context?`) => `void`

Defined in: [packages/elogs/src/interfaces.ts:388](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L388)

记录 ERROR 级别的错误日志。
通常用于记录需要立即关注的异常或失败情况。

#### Parameters

##### request

`Request`

当前请求对象（必填），用于关联请求上下文

##### message

`string`

错误消息（必填），描述发生了什么错误

##### context?

`Record`\<`string`, `unknown`\>

可选，额外的错误上下文，如错误码、堆栈信息等

#### Returns

`void`

#### Example

```typescript
try {
  await riskyOperation();
} catch (err) {
  logger.error(request, 'Database query failed', {
    query: 'SELECT * FROM users',
    error: err.message,
    stack: err.stack
  });
}
```

***

### getContext

> **getContext**: (`request`) => `Readonly`\<`Record`\<`string`, `unknown`\>\>

Defined in: [packages/elogs/src/interfaces.ts:410](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L410)

获取当前请求累积的 per-request 上下文数据。

上下文数据通过 `mergeContext` 方法累积，会在 access log 中输出。
返回的对象是只读的，不应直接修改。

#### Parameters

##### request

`Request`

当前请求对象（必填）

#### Returns

`Readonly`\<`Record`\<`string`, `unknown`\>\>

当前请求累积的上下文对象的只读快照

#### Example

```typescript
const ctx = logger.getContext(request);
console.log('Current request context:', ctx);
// 输出: { userId: '123', apiVersion: 'v2', processingTime: 45 }
```

***

### handleHttpError

> **handleHttpError**: (`request`, `error`, `store`, `options?`) => `void`

Defined in: [packages/elogs/src/interfaces.ts:435](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L435)

处理 HTTP 错误并记录详细的错误日志。

这是一个高级便捷方法，会自动从 `error` 中提取状态码、错误消息等信息，
并格式化输出到日志中，适合在全局错误处理中间件中使用。

#### Parameters

##### request

`Request`

当前请求对象（必填）

##### error

`unknown`

捕获的错误对象（必填），可以是 Error 实例、HTTPError 或任意值

##### store

`StoreData`

存储数据（必填），包含日志器等上下文信息

##### options?

[`CreateElogsOptions`](CreateElogsOptions.md)

可选的配置选项，可覆盖默认行为

#### Returns

`void`

#### Example

```typescript
// 在 Elysia 全局错误处理器中使用
app.onError(({ request, error, store }) => {
  store.logger.handleHttpError(request, error, store, {
    logLevel: 'error',
    includeStack: true
  });
  return { error: 'Internal Server Error' };
});
```

***

### info

> **info**: (`request`, `message`, `context?`) => `void`

Defined in: [packages/elogs/src/interfaces.ts:459](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L459)

记录 INFO 级别的信息日志。

通常用于记录重要的业务事件或系统状态变化。

#### Parameters

##### request

`Request`

当前请求对象（必填），用于关联请求上下文

##### message

`string`

信息消息（必填），描述事件

##### context?

`Record`\<`string`, `unknown`\>

可选，额外的上下文数据

#### Returns

`void`

#### Example

```typescript
logger.info(request, 'User logged in successfully', {
  userId: '123',
  loginMethod: 'oauth'
});
```

***

### log

> **log**: (`level`, `request`, `data`, `store`) => `void`

Defined in: [packages/elogs/src/interfaces.ts:481](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L481)

记录指定级别的日志（通用方法）。

适用于需要动态指定日志级别的场景，比使用 `debug`、`info` 等快捷方法更灵活。

#### Parameters

##### level

`LogLevel`

日志级别（必填），必须是 'debug' | 'info' | 'warn' | 'error' 之一

##### request

`Request`

当前请求对象（必填）

##### data

`Record`\<`string`, `unknown`\>

要记录的日志数据对象（必填）

##### store

`StoreData`

存储数据（必填），包含日志器等上下文信息

#### Returns

`void`

#### Example

```typescript
const level = isProduction ? 'error' : 'debug';
logger.log(level, request, { event: 'UserAction', action: 'click' }, store);
```

***

### mergeContext

> **mergeContext**: (`request`, `partial`) => `void`

Defined in: [packages/elogs/src/interfaces.ts:511](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L511)

合并额外的数据到当前请求的上下文中。

这些数据会在后续的 access log 中自动包含，非常适合在请求处理过程中
逐步累积上下文信息（如经过认证后注入用户 ID）。

#### Parameters

##### request

`Request`

当前请求对象（必填）

##### partial

`Record`\<`string`, `unknown`\>

要合并的部分上下文对象（必填），会与现有上下文进行浅合并

#### Returns

`void`

#### Example

```typescript
// 在认证中间件中记录用户信息
app.use(({ request, store }) => {
  const user = authenticate(request);
  store.logger.mergeContext(request, {
    userId: user.id,
    userRole: user.role,
    authenticated: true
  });
  // 这些数据会在后续的 access log 中自动出现
});
```

***

### pino

> **pino**: `Pino`

Defined in: [packages/elogs/src/interfaces.ts:529](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L529)

底层的 Pino Logger 实例。

当内置方法无法满足需求时，可以直接访问 Pino 实例进行高级操作，
如创建子 logger、使用 Pino 特定的 API 等。

#### Example

```typescript
// 创建子 logger 用于特定模块
const moduleLogger = logger.pino.child({ module: 'UserService' });
moduleLogger.info('UserService initialized');

// 直接使用 Pino 的级别设置
logger.pino.level = 'debug';
```

***

### warn

> **warn**: (`request`, `message`, `context?`) => `void`

Defined in: [packages/elogs/src/interfaces.ts:550](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L550)

记录 WARNING 级别的警告日志。

用于记录非致命的异常情况、过时功能的使用或潜在问题，
需要关注但不至于立即影响系统运行。

#### Parameters

##### request

`Request`

当前请求对象（必填）

##### message

`string`

警告消息（必填），描述警告内容

##### context?

`Record`\<`string`, `unknown`\>

可选，额外的上下文数据

#### Returns

`void`

#### Example

```typescript
logger.warn(request, 'Deprecated API version used', {
  apiVersion: 'v1',
  deprecatedSince: '2025-01-01',
  recommendedVersion: 'v2'
});
```
