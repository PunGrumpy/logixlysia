[**@pori15/elogs**](../README.md)

***

[@pori15/elogs](../README.md) / translateDrizzleError

# Function: translateDrizzleError()

> **translateDrizzleError**(`error`, `custom?`): `Error`

Defined in: [packages/elogs/src/translator/drizzle.ts:120](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/translator/drizzle.ts#L120)

翻译一个错误。如果命中某个 translator,返回 `httpError(...)`(原 error
信息会被吞掉,只保留 status + message);如果不命中,原样返回(若不是
Error 实例则包成 `new Error(String(e))`)。

## Parameters

### error

`unknown`

任意 unknown(通常是 try/catch 块里的 e)

### custom?

`ErrorTranslator`[]

用户自定义 translator,会先于内置 translators 执行,
  命中后直接返回(短链)

## Returns

`Error`
