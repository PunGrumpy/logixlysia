/**
 * createElogs 2.0 — Drizzle ORM 错误翻译器
 *
 * 把 Drizzle 抛出的错误(`DrizzleError` / `DrizzleQueryError`,携带底层
 * driver 的错误码)翻译为 `httpError(status, message)` 抛回去。
 *
 * 三种使用方式:
 * 1. 手动:`throw translateDrizzleError(err)` 在 try/catch 里调一次
 * 2. 自动:`createElogs({ autoTranslate: { db: 'drizzle' } })`
 * 3. 混合:在 `autoTranslate.custom` 里追加自己的 `ErrorTranslator`
 *
 * 翻译器**只**决定日志级别和内容,不劫持错误处理流程。
 */

import { httpError } from "../errors";
import type { ErrorTranslator } from "../interfaces";

/**
 * Drizzle 错误的最小形状(兼容 DrizzleError / DrizzleQueryError,
 * 不强制依赖 drizzle-orm 的类型 —— 只取 `.name` + `.code` 字段)。
 * @public
 */
export interface DrizzleLikeError {
  cause?: unknown;
  code?: string;
  name?: string;
  table?: string;
}

/**
 * 类型守卫:是不是 Drizzle 抛的错误
 * @public
 */
export const isDrizzleError = (e: unknown): e is DrizzleLikeError => {
  if (typeof e !== "object" || e === null) {
    return false;
  }
  const { name } = e as { name?: unknown };
  return name === "DrizzleError" || name === "DrizzleQueryError";
};

/**
 * 内置翻译器表 —— 按"约束类别"分组,每组覆盖常见 driver 错误码。
 *
 * 状态码映射遵循:
 * - 唯一约束冲突 / 重复键 → 409 Conflict
 * - 外键违反 → 400 Bad Request
 * - NOT NULL 违反 → 422 Unprocessable Entity
 * - CHECK 约束失败 → 422 Unprocessable Entity
 * - 数据库连接错误 → 503 Service Unavailable
 * - 兜底 → 500 Internal Server Error
 */
const DRIZZLE_TRANSLATORS: ErrorTranslator[] = [
  // ---- 唯一约束冲突 ----
  {
    canHandle: (e) => isDrizzleError(e) && e.code === "23505",
    translate: () => httpError(409, "Unique constraint violation"),
  },
  {
    canHandle: (e) => isDrizzleError(e) && e.code === "ER_DUP_ENTRY",
    translate: () => httpError(409, "Duplicate entry"),
  },
  {
    canHandle: (e) =>
      isDrizzleError(e) && e.code === "SQLITE_CONSTRAINT_UNIQUE",
    translate: () => httpError(409, "Unique violation"),
  },

  // ---- 外键违反 ----
  {
    canHandle: (e) => isDrizzleError(e) && e.code === "23503",
    translate: () => httpError(400, "Foreign key violation"),
  },
  {
    canHandle: (e) => isDrizzleError(e) && e.code === "ER_NO_REFERENCED_ROW_2",
    translate: () => httpError(400, "Foreign key violation"),
  },
  {
    canHandle: (e) =>
      isDrizzleError(e) && e.code === "SQLITE_CONSTRAINT_FOREIGNKEY",
    translate: () => httpError(400, "Foreign key violation"),
  },

  // ---- NOT NULL 违反 ----
  {
    canHandle: (e) => isDrizzleError(e) && e.code === "23502",
    translate: () => httpError(422, "Required field missing"),
  },

  // ---- CHECK 约束 ----
  {
    canHandle: (e) => isDrizzleError(e) && e.code === "23514",
    translate: () => httpError(422, "Constraint check failed"),
  },

  // ---- 数据库连接错误(PG SQLSTATE class 08) ----
  {
    canHandle: (e) =>
      isDrizzleError(e) &&
      (e.code === "08000" ||
        e.code === "08001" ||
        e.code === "08003" ||
        e.code === "08006" ||
        e.code === "08004" ||
        e.code === "08007"),
    translate: () => httpError(503, "Database unavailable"),
  },
];

/**
 * 翻译一个错误。如果命中某个 translator,返回 `httpError(...)`(原 error
 * 信息会被吞掉,只保留 status + message);如果不命中,原样返回(若不是
 * Error 实例则包成 `new Error(String(e))`)。
 *
 * @param error - 任意 unknown(通常是 try/catch 块里的 e)
 * @param custom - 用户自定义 translator,会先于内置 translators 执行,
 *   命中后直接返回(短链)
 * @public
 */
export const translateDrizzleError = (
  error: unknown,
  custom?: ErrorTranslator[]
): Error => {
  const translators = [...(custom ?? []), ...DRIZZLE_TRANSLATORS];
  for (const t of translators) {
    if (t.canHandle(error)) {
      return t.translate(error);
    }
  }
  return error instanceof Error ? error : new Error(String(error));
};
