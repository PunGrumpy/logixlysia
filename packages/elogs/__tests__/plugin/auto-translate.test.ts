/**
 * createElogs 2.0 — autoTranslate 集成测试
 *
 * 核心不变量(必须全部通过):
 * 1. 翻译后的 error 决定日志级别(409→WARNING,5xx→ERROR)
 * 2. **原 error 仍以原形态传播**(Elysia 默认 problem 响应 + 用户 .error() 链路)
 * 3. onError 钩子不 return value,错误继续向下游
 * 4. 自定义 custom translator 在内置之前匹配
 */

import { describe, expect, mock, test } from "bun:test";
import { Elysia, problem } from "elysia";

import { createElogs } from "../../src";
import { httpError } from "../../src/errors";
import type { CreateElogsOptions } from "../../src/interfaces";

const makeTransport = () =>
  mock<(lvl: unknown, msg: unknown, meta?: unknown) => void>(() => {
    // no-op:仅用于断言调用
  });

const silent = (
  transport: ReturnType<typeof makeTransport>
): CreateElogsOptions => ({
  config: {
    disableFileLogging: true,
    disableInternalLogger: true,
    transports: [{ log: transport }],
  },
});

/** Mock Drizzle 风格错误类 —— name="DrizzleError" + .code,用于 Elysia .error() 匹配 */
class DrizzleError extends Error {
  override name = "DrizzleError";
  code: string;
  constructor(code: string) {
    super(`driver error: ${code}`);
    this.code = code;
  }
}

const makeDrizzleError = (code: string): DrizzleError => new DrizzleError(code);

describe("autoTranslate: { db: 'drizzle' }", () => {
  test("Drizzle 23505 唯一约束 → 日志 WARNING + 用户 .error 返回 409", async () => {
    const transport = makeTransport();
    const app = new Elysia()
      .use(
        createElogs({
          ...silent(transport),
          autoTranslate: { db: "drizzle" },
        })
      )
      .error(DrizzleError, () => problem(409, { detail: "Conflict" }))
      .get("/users", () => {
        throw makeDrizzleError("23505");
      });

    const res = await app.handle(new Request("http://localhost/users"));

    expect(res.status).toBe(409);
    expect(transport).toHaveBeenCalledTimes(1);
    const [level, , meta] = transport.mock.calls[0] ?? [];
    expect(level).toBe("WARNING");
    expect((meta as { status?: number } | undefined)?.status).toBe(409);
    expect((meta as { message?: string } | undefined)?.message).toBe(
      "Unique constraint violation"
    );
  });

  test("Drizzle 08006 连接错误 → 日志 ERROR(status 503),响应走 Elysia 默认 500", async () => {
    const transport = makeTransport();
    const app = new Elysia()
      .use(
        createElogs({
          ...silent(transport),
          autoTranslate: { db: "drizzle" },
        })
      )
      .get("/health", () => {
        throw makeDrizzleError("08006");
      });

    const res = await app.handle(new Request("http://localhost/health"));

    // 日志:翻译后 status=503,ERROR 级别
    expect(transport).toHaveBeenCalledTimes(1);
    const [level, , meta] = transport.mock.calls[0] ?? [];
    expect(level).toBe("ERROR");
    expect((meta as { status?: number } | undefined)?.status).toBe(503);
    // 响应:用户没注册 .error() → Elysia 默认处理原错误(无 status) → 500
    // **关键不变量**:插件不劫持响应,用户自己用 .error() 接管
    expect(res.status).toBe(500);
  });

  test("非 Drizzle 错误 → 翻译器不命中,500 ERROR", async () => {
    const transport = makeTransport();
    const app = new Elysia()
      .use(
        createElogs({
          ...silent(transport),
          autoTranslate: { db: "drizzle" },
        })
      )
      .get("/boom", () => {
        throw new Error("plain boom");
      });

    const res = await app.handle(new Request("http://localhost/boom"));

    expect(res.status).toBe(500);
    expect(transport).toHaveBeenCalledTimes(1);
    const [level, , meta] = transport.mock.calls[0] ?? [];
    expect(level).toBe("ERROR");
    expect((meta as { message?: string } | undefined)?.message).toBe(
      "plain boom"
    );
  });

  test("custom translator 优先于内置:日志按 custom 翻译的 418 走 WARNING", async () => {
    const transport = makeTransport();
    const app = new Elysia()
      .use(
        createElogs({
          ...silent(transport),
          autoTranslate: {
            custom: [
              {
                canHandle: (e) =>
                  typeof e === "object" &&
                  e !== null &&
                  (e as { code?: string }).code === "23505",
                translate: () => httpError(418, "I'm a teapot"),
              },
            ],
            db: "drizzle",
          },
        })
      )
      .get("/teapot", () => {
        throw makeDrizzleError("23505");
      });

    const res = await app.handle(new Request("http://localhost/teapot"));

    // 日志:custom 翻译为 418 → 4xx → WARNING
    const [level, , meta] = transport.mock.calls[0] ?? [];
    expect(level).toBe("WARNING");
    expect((meta as { status?: number } | undefined)?.status).toBe(418);
    // 响应:用户没注册 .error() → Elysia 默认 500(关键不变量:不劫持)
    expect(res.status).toBe(500);
  });

  test("关键不变量:原 error 不被替换,用户 .error() 看到原 error 引用", async () => {
    const transport = makeTransport();
    const originalError = makeDrizzleError("23505");
    let receivedError: unknown;

    const app = new Elysia()
      .use(
        createElogs({
          ...silent(transport),
          autoTranslate: { db: "drizzle" },
        })
      )
      .error(DrizzleError, (ctx) => {
        receivedError = ctx.error;
        return problem(409, { detail: "Conflict" });
      })
      .get("/users", () => {
        throw originalError;
      });

    await app.handle(new Request("http://localhost/users"));

    // 用户 .error 看到的是原 error 引用,不是翻译后的 httpError
    expect(receivedError).toBe(originalError);
  });

  test("未配 autoTranslate 时,原 HTTPError 决定 status(向后兼容)", async () => {
    const transport = makeTransport();
    const app = new Elysia()
      .use(createElogs(silent(transport)))
      .get("/missing", () => {
        throw httpError(404, "user not found");
      });

    const res = await app.handle(new Request("http://localhost/missing"));

    expect(res.status).toBe(404);
    expect(transport).toHaveBeenCalledTimes(1);
    const [level] = transport.mock.calls[0] ?? [];
    expect(level).toBe("WARNING");
  });
});
