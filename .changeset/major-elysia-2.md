---
"@pori15/elogs": major
---

# 7.0.0 — Elysia 2.0 适配重写

完全拥抱 Elysia 2.0 原生错误系统,删除所有自建错误抽象。

## 破坏性变更

### 删除的导出

| 旧 API | 替代 |
|--------|------|
| `ProblemError` 类 | `HTTPError` from `elysia` |
| `createProblem()` 工厂 | `problem()` from `elysia` |
| `HttpError.NotFound(...)` 命名空间 | `httpError(404, "...")` 工厂或 `class extends HTTPError` |
| `normalizeToProblem` | Elysia 原生 `.error(Class, handler)` |
| `getErrorCode` / `getErrorMeta` | 同上 |
| `ErrorMapping` / `ErrorResolver` / `ErrorConfig.errorMap` | `createElogs.errorMap()` 工厂 |
| `Code` 联合类型 | Elysia 内置 Error class 类型 |

### 依赖

- `peerDependencies.elysia`: `^1.4.28` → `>=2.0.0-exp.62`
- 适配 Elysia 2.0 实验版 API

## 新 API

```ts
import { Elysia, HTTPError } from "elysia";
import { createElogs, httpError, errorMap } from "@pori15/elogs";

// 1. 直接用 Elysia 2.0 原生 HTTPError
class OutOfCredit extends HTTPError<"OUT_OF_CREDIT"> {
  type = "OUT_OF_CREDIT" as const;
  override readonly status = 402;
  override detail() { return { balance: 0 }; }
}

// 2. 用 createElogs 提供的 httpError 工厂(类似 1.x 风格)
const userNotFound = httpError(404, "user not found", { userId: 42 });

// 3. 用 createElogs.errorMap() 批量生成 Error class
const pgErrors = errorMap({
  "23505": { status: 409, title: "Duplicate Key" },
  "23503": { status: 400, title: "Foreign Key Violation" },
});

new Elysia()
  .use(createElogs({
    logLevel: ["INFO", "WARNING", "ERROR"],
    errors: [OutOfCredit, ...pgErrors],
  }))
  .get("/buy", () => { throw new OutOfCredit(); });
```

每次抛错,createElogs 会:
1. 通过 `.error(Class, handler)` 拦截特定类,handler 内写一条结构化日志
2. 返回 `undefined` 让 Elysia 自动以 `application/problem+json` 响应
3. 对未匹配的 unknown error,fallback `.error(fn)` 兜底

## 已知 Elysia 2.0.0-exp.62 限制

- 启动 banner 钩子(`onStart`)被 Elysia 移除,改用 `app.listen(port, () => elogsBanner(server, options))` 手动调用
- body schema 自动验证有 bug,部分场景需手动校验
- `errorMap` 的自定义 `title` 在 fallback 流程中会被 `StatusMapBack` 默认值覆盖
