[**@pori15/elogs**](../README.md)

***

[@pori15/elogs](../README.md) / CreateElogsOptions

# Interface: CreateElogsOptions

Defined in: [packages/elogs/src/interfaces.ts:301](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L301)

Elogs 插件配置

新版推荐:`{ config: {...}, preset?: 'dev' | 'prod' | 'json' }`
同时兼容 root-level 字段(legacy tests)

## Properties

### autoTranslate?

> `optional` **autoTranslate?**: `AutoTranslateConfig`

Defined in: [packages/elogs/src/interfaces.ts:303](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L303)

自动翻译错误:在单点 onError 钩子里跑 translator 链

***

### config?

> `optional` **config?**: [`ElogsConfig`](ElogsConfig.md)

Defined in: [packages/elogs/src/interfaces.ts:305](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L305)

新版配置块

***

### error?

> `optional` **error?**: `ErrorConfig`

Defined in: [packages/elogs/src/interfaces.ts:307](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L307)

错误处理配置

***

### file?

> `optional` **file?**: `false` \| `FileConfig`

Defined in: [packages/elogs/src/interfaces.ts:309](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L309)

文件日志配置(legacy)

***

### format?

> `optional` **format?**: `FormatConfig`

Defined in: [packages/elogs/src/interfaces.ts:311](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L311)

日志格式配置(legacy)

***

### logLevel?

> `optional` **logLevel?**: `LogLevel`[]

Defined in: [packages/elogs/src/interfaces.ts:313](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L313)

日志级别过滤 (root-level 别名,等价于 `config.logFilter.level`)

***

### pino?

> `optional` **pino?**: `LoggerOptions`\<`never`, `boolean`\>

Defined in: [packages/elogs/src/interfaces.ts:315](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L315)

Pino Logger 原生配置透传(legacy)

***

### preset?

> `optional` **preset?**: `"dev"` \| `"prod"` \| `"json"` \| `string` & `object`

Defined in: [packages/elogs/src/interfaces.ts:321](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L321)

预设,应用一组默认 config 值。
内置:`"dev"` / `"prod"` / `"json"`(IDE 自动补全)。
任意字符串都行 —— 通过 `registerPreset(name, defaults)` 加自己的。

***

### startup?

> `optional` **startup?**: `StartupConfig`

Defined in: [packages/elogs/src/interfaces.ts:323](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L323)

启动消息配置(legacy)

***

### transports?

> `optional` **transports?**: `Transport`[] \| `TransportsConfig`

Defined in: [packages/elogs/src/interfaces.ts:325](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/interfaces.ts#L325)

自定义传输(legacy)
