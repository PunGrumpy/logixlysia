/**
 * createElogs 2.0 — 数据库错误演示路由
 *
 * 演示三种 Drizzle 错误翻译用法(均用 mock 错误,无需真实 DB):
 * - /demo/db-error/duplicate  : 模拟 23505(唯一约束冲突)
 * - /demo/db-error/foreign-key: 模拟 23503(外键违反)
 * - /demo/db-error/connect   : 模拟 08006(连接失败)
 * - /demo/db-error/throw-raw : 抛原始错误,演示 autoTranslate 自动接管
 *
 * 关键观察点:
 * - 翻译只决定**日志级别**和**记录内容**
 * - 响应格式由用户用 `.error("DrizzleError", ...)` 完全控制
 * - 错误继续以原 error 形态传播(用户 .error 看到的是原引用)
 */

import { type CreateElogs, globalLogger, pino } from "@pori15/elogs";
import { problem } from "elysia";

/** Mock Drizzle error class — mirrors drizzle-orm's `DrizzleError` shape (name
 *  + driver code) so Elysia's `.error()` can match by class identity. In a
 *  real app this would be `import { DrizzleError } from "drizzle-orm"`. */
class DrizzleError extends Error {
  code: string;
  constructor(code: string) {
    super(`PG driver reported: ${code}`);
    this.name = "DrizzleError";
    this.code = code;
  }
}

const makeDrizzleError = (code: string): DrizzleError => new DrizzleError(code);

export const dbRouter = <App extends CreateElogs>(app: App) =>
  app
    // 用户用 Elysia 2 原生 .error() 接管 DrizzleError 的响应格式
    .error(DrizzleError, (ctx) => {
      const code = (ctx.error as { code?: string }).code ?? "UNKNOWN";
      // 按 driver code 选不同的 problem detail
      if (code === "23505") {
        return problem(409, {
          detail: "Duplicate key — that value already exists",
        });
      }
      if (code === "23503") {
        return problem(400, {
          detail: "Foreign key violation — referenced row missing",
        });
      }
      if (code === "08006") {
        return problem(503, {
          detail: "Database unavailable — try again later",
        });
      }
      return problem(500, { detail: `Unhandled DB error (code=${code})` });
    })

    /**
     * 方式 1:手动翻译 —— 在 try/catch 里调 translateDrizzleError
     * 适合"只在某条路由要处理 DB 错误"的场景
     */
    .get("/demo/db-error/manual/:code", ({ params }) => {
      throw makeDrizzleError(params.code);
    })

    /**
     * 方式 2/3:依赖 autoTranslate(已在外层 createElogs 配)自动翻译
     * 路由本身只抛原 error,翻译发生在 onError 钩子里
     */
    .get("/demo/db-error/duplicate", () => {
      throw makeDrizzleError("23505");
    })
    .get("/demo/db-error/foreign-key", () => {
      throw makeDrizzleError("23503");
    })
    .get("/demo/db-error/connect", () => {
      throw makeDrizzleError("08006");
    })

    /**
     * globalLogger.error(err) 重载演示 —— 一行,自动 unwrap .message + .stack
     * 对比 manual 路径:这里不依赖 autoTranslate,直接用 globalLogger 记录错误
     */
    .get("/demo/db-error/global", () => {
      try {
        throw makeDrizzleError("23505");
      } catch (err) {
        // globalLogger.error 接受 string | Error,这里 narrow 一下
        if (err instanceof Error) {
          globalLogger.error(err);
        }
      }
      return { ok: true };
    })

    /**
     * 顶层 pino 演示 —— 无 request 场景,直接调 pino.info()
     * 用于模块顶层 banner / 后台任务 / DB 层独立调用
     */
    .get("/demo/db-error/pino", () => {
      pino.info(
        { source: "demo" },
        "Direct pino call — bypasses emit pipeline"
      );
      return { ok: true };
    })

    // 抛一个完全没被翻译的错误(非 Drizzle 形态),作为对照
    .get("/demo/db-error/raw", () => {
      throw new Error("some unrelated error");
    });
