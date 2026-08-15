[**@pori15/elogs**](../README.md)

***

[@pori15/elogs](../README.md) / DrizzleLikeError

# Interface: DrizzleLikeError

Defined in: [packages/elogs/src/translator/drizzle.ts:23](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/translator/drizzle.ts#L23)

Drizzle 错误的最小形状(兼容 DrizzleError / DrizzleQueryError,
不强制依赖 drizzle-orm 的类型 —— 只取 `.name` + `.code` 字段)。

## Properties

### cause?

> `optional` **cause?**: `unknown`

Defined in: [packages/elogs/src/translator/drizzle.ts:24](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/translator/drizzle.ts#L24)

***

### code?

> `optional` **code?**: `string`

Defined in: [packages/elogs/src/translator/drizzle.ts:25](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/translator/drizzle.ts#L25)

***

### name?

> `optional` **name?**: `string`

Defined in: [packages/elogs/src/translator/drizzle.ts:26](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/translator/drizzle.ts#L26)

***

### table?

> `optional` **table?**: `string`

Defined in: [packages/elogs/src/translator/drizzle.ts:27](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/translator/drizzle.ts#L27)
