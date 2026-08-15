[**@pori15/elogs**](../README.md)

***

[@pori15/elogs](../README.md) / ElogsConfig

# Interface: ElogsConfig

Defined in: [packages/elogs/src/interfaces.ts:217](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L217)

新版(上游 main)配置 — 所有 createElogs 行为参数集中在 `config` 字段下。
同时保留 root-level 字段(legacy + 旧测试)以便向后兼容。

## Properties

### autoRedact?

> `optional` **autoRedact?**: `boolean`

Defined in: [packages/elogs/src/interfaces.ts:219](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L219)

自动 redact 敏感信息(headers, body, query string)

***

### contextDepth?

> `optional` **contextDepth?**: `number`

Defined in: [packages/elogs/src/interfaces.ts:221](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L221)

上下文树展开深度(默认 1)

***

### customLogFormat?

> `optional` **customLogFormat?**: `string`

Defined in: [packages/elogs/src/interfaces.ts:223](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L223)

自定义日志格式模板,支持 token:`{now}` `{level}` `{duration}` `{method}` `{pathname}` `{status}` `{message}` `{ip}` `{context}` `{query}` `{statusText}` `{requestId}` `{service}` `{speed}` 等

***

### disableFileLogging?

> `optional` **disableFileLogging?**: `boolean`

Defined in: [packages/elogs/src/interfaces.ts:225](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L225)

禁用文件日志(即使有 logFilePath)

***

### disableInternalLogger?

> `optional` **disableInternalLogger?**: `boolean`

Defined in: [packages/elogs/src/interfaces.ts:227](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L227)

禁用内置控制台 logger

***

### disableWebSocketLogging?

> `optional` **disableWebSocketLogging?**: `boolean`

Defined in: [packages/elogs/src/interfaces.ts:229](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L229)

禁用 WebSocket 日志

***

### ip?

> `optional` **ip?**: `boolean`

Defined in: [packages/elogs/src/interfaces.ts:231](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L231)

在日志中显示 IP(x-forwarded-for / x-real-ip)

***

### logDirMode?

> `optional` **logDirMode?**: `number`

Defined in: [packages/elogs/src/interfaces.ts:233](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L233)

目录模式(默认 0o700)

***

### logErrorPayload?

> `optional` **logErrorPayload?**: `boolean`

Defined in: [packages/elogs/src/interfaces.ts:235](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L235)

把错误对象的 payload(可能是用户输入)写入 meta,默认 false(防泄露)

***

### logFileMode?

> `optional` **logFileMode?**: `number`

Defined in: [packages/elogs/src/interfaces.ts:237](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L237)

文件模式(默认 0o600)

***

### logFilePath?

> `optional` **logFilePath?**: `string`

Defined in: [packages/elogs/src/interfaces.ts:239](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L239)

日志文件路径

***

### logFilter?

> `optional` **logFilter?**: `LogFilter`

Defined in: [packages/elogs/src/interfaces.ts:241](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L241)

日志级别过滤

***

### logQueryParams?

> `optional` **logQueryParams?**: `boolean`

Defined in: [packages/elogs/src/interfaces.ts:243](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L243)

在 pathname 中包含 query string

***

### logRotation?

> `optional` **logRotation?**: `LogRotationConfig`

Defined in: [packages/elogs/src/interfaces.ts:245](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L245)

日志轮转

***

### pino?

> `optional` **pino?**: `PinoConfig`

Defined in: [packages/elogs/src/interfaces.ts:247](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L247)

Pino 配置

***

### redactKeys?

> `optional` **redactKeys?**: `string`[]

Defined in: [packages/elogs/src/interfaces.ts:249](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L249)

自定义 redact key 列表(合并到默认敏感 key)

***

### requestId?

> `optional` **requestId?**: `boolean` \| `RequestIdConfig`

Defined in: [packages/elogs/src/interfaces.ts:251](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L251)

request-id 跟踪

***

### service?

> `optional` **service?**: `string`

Defined in: [packages/elogs/src/interfaces.ts:253](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L253)

服务名(显示在日志中)

***

### showContextTree?

> `optional` **showContextTree?**: `boolean`

Defined in: [packages/elogs/src/interfaces.ts:255](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L255)

显示上下文树(默认 true)

***

### showIp?

> `optional` **showIp?**: `boolean`

Defined in: [packages/elogs/src/interfaces.ts:257](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L257)

显示 IP(等价于 ip)

***

### showStartupMessage?

> `optional` **showStartupMessage?**: `boolean`

Defined in: [packages/elogs/src/interfaces.ts:259](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L259)

是否显示启动消息

***

### slowThreshold?

> `optional` **slowThreshold?**: `number`

Defined in: [packages/elogs/src/interfaces.ts:261](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L261)

慢请求阈值(ms),超过显示慢请求标记

***

### startupMessageFormat?

> `optional` **startupMessageFormat?**: `"simple"` \| `"banner"`

Defined in: [packages/elogs/src/interfaces.ts:263](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L263)

启动消息格式

***

### timestamp?

> `optional` **timestamp?**: `string` \| \{ `format`: `string`; \}

Defined in: [packages/elogs/src/interfaces.ts:265](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L265)

时间戳格式或 { format }

***

### transports?

> `optional` **transports?**: `Transport`[]

Defined in: [packages/elogs/src/interfaces.ts:267](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L267)

透传 transport 列表(emit 用;`transports` 也可以在 root,但 emit 只看 config)

***

### transportThrottleMs?

> `optional` **transportThrottleMs?**: `number`

Defined in: [packages/elogs/src/interfaces.ts:269](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L269)

Transport 错误节流窗口(ms)

***

### useAsyncLocalStorage?

> `optional` **useAsyncLocalStorage?**: `boolean`

Defined in: [packages/elogs/src/interfaces.ts:285](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L285)

启用 AsyncLocalStorage,让 `useLogger()` 在深调用栈拿得到 logger。

**实现细节**:在 Elysia 2 的 `.request()` 钩子内用 `loggerStorage.enterWith(...)`
设置 scope。这会**透传**到后续的路由 handler / `.afterHandle()`(只要 Elysia
自己在它们之间不再额外 `als.run()`)。

**限制**:
- Elysia 2 升级后如果在内部多次 `als.run()`,此机制会失效,`useLogger()` 退回
  NOOP_LOGGER,日志被吞。
- `enterWith` 不影响"已在运行的 async 树",只影响"从此处之后"新发起的 async。

**推荐**:深调用栈场景优先用 `({ log })` derive(Elysia 自己的 context 机制,
不依赖 ALS);`useLogger()` 仅在"想拿 logger 但不想改签名"的便利场景使用。

***

### useColors?

> `optional` **useColors?**: `boolean`

Defined in: [packages/elogs/src/interfaces.ts:287](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L287)

启用彩色输出(默认 true 仅 TTY)

***

### useTransportsOnly?

> `optional` **useTransportsOnly?**: `boolean`

Defined in: [packages/elogs/src/interfaces.ts:289](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L289)

只使用 transports,禁用控制台 + 文件

***

### verySlowThreshold?

> `optional` **verySlowThreshold?**: `number`

Defined in: [packages/elogs/src/interfaces.ts:291](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L291)

极慢请求阈值(ms),超过显示更严重标记
