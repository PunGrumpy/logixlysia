[**@pori15/elogs**](../README.md)

***

[@pori15/elogs](../README.md) / errorMap

# Function: errorMap()

> **errorMap**(`map`): (...`args`) => `HTTPError`[]

Defined in: [packages/elogs/src/errors.ts:94](https://github.com/eastgold15/elogs/blob/e27e47aed45d7f2c1751b31a0b3306535c4f3fdb/packages/elogs/src/errors.ts#L94)

数据库错误码 → HTTPError 类的工厂

保留 1.x `ErrorMapping.errorMap` 的语义,但用 Elysia 2.0 原生类表达。

**用途变更**:不再被插件自动注册。生成类后,用户用 Elysia 2 原生
`.error(MyClass, fn)` 自行注册。

## Parameters

### map

`Record`\<`string`, \{ `status`: `number`; `title`: `string`; `type?`: `string`; \}\>

## Returns

(...`args`) => `HTTPError`[]

## Example

```ts
import { errorMap } from "@pori15/elogs";
import { problem } from "elysia";

const errors = errorMap({
  "23505": { status: 409, title: "Duplicate Key" },
  "23503": { status: 400, title: "Foreign Key Violation" },
});

new Elysia()
  .use(createElogs())
  .error(errors[0], (ctx) => problem(409, { detail: "Duplicate" }))
  .get("/users", () => {
    throw new errors[0]();
  });
```
