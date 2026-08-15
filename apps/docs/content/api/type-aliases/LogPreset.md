[**@pori15/elogs**](../README.md)

***

[@pori15/elogs](../README.md) / LogPreset

# Type Alias: LogPreset

> **LogPreset** = `"dev"` \| `"prod"` \| `"json"` \| `string` & `object`

Defined in: [packages/elogs/src/config/resolve-options.ts:12](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/config/resolve-options.ts#L12)

内置 preset 名 —— 给 IDE 自动补全。
任意字符串都能传,运行时从 registry 查表(用户可以通过
`registerPreset` 加自己的 preset)。
