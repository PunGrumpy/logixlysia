[**@pori15/elogs**](../README.md)

***

[@pori15/elogs](../README.md) / RequestContextStore

# Interface: RequestContextStore

Defined in: [packages/elogs/src/context/request-context.ts:10](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/context/request-context.ts#L10)

## Properties

### clearContext

> **clearContext**: (`key`) => `void`

Defined in: [packages/elogs/src/context/request-context.ts:11](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/context/request-context.ts#L11)

#### Parameters

##### key

[`ContextKey`](../type-aliases/ContextKey.md)

#### Returns

`void`

***

### getContext

> **getContext**: (`key`) => `Readonly`\<`Record`\<`string`, `unknown`\>\>

Defined in: [packages/elogs/src/context/request-context.ts:12](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/context/request-context.ts#L12)

#### Parameters

##### key

[`ContextKey`](../type-aliases/ContextKey.md)

#### Returns

`Readonly`\<`Record`\<`string`, `unknown`\>\>

***

### mergeContext

> **mergeContext**: (`key`, `partial`) => `void`

Defined in: [packages/elogs/src/context/request-context.ts:13](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/context/request-context.ts#L13)

#### Parameters

##### key

[`ContextKey`](../type-aliases/ContextKey.md)

##### partial

`Record`\<`string`, `unknown`\>

#### Returns

`void`

***

### peekContext

> **peekContext**: (`key`) => `Readonly`\<`Record`\<`string`, `unknown`\>\>

Defined in: [packages/elogs/src/context/request-context.ts:19](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/context/request-context.ts#L19)

Read-only view of the bag for use inside the single emit pipeline.
Returned object is the internal bag itself (no defensive clone) — callers
must not mutate it; emit only reads/spreads it into a new object literal.

#### Parameters

##### key

[`ContextKey`](../type-aliases/ContextKey.md)

#### Returns

`Readonly`\<`Record`\<`string`, `unknown`\>\>
