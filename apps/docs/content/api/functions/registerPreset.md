[**@pori15/elogs**](../README.md)

***

[@pori15/elogs](../README.md) / registerPreset

# Function: registerPreset()

> **registerPreset**(`name`, `defaults`): `void`

Defined in: [packages/elogs/src/config/preset-registry.ts:43](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/config/preset-registry.ts#L43)

注册一个用户 preset。重复同名 → 抛错。

## Parameters

### name

`string`

### defaults

[`ElogsConfig`](../interfaces/ElogsConfig.md)

## Returns

`void`

## Example

```ts
import { registerPreset } from "@pori15/elogs";

registerPreset("staging", {
  pino: { prettyPrint: true },
  showContextTree: true,
  requestId: true,
});

app.use(createElogs({ preset: "staging" }));
```
