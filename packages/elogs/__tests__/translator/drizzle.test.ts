/**
 * createElogs 2.0 — Drizzle 错误翻译器单元测试
 *
 * 覆盖:
 * - PG/MySQL/SQLite 错误码 → 对应 HTTP 状态
 * - 非 Drizzle 错误 → 原样返回
 * - 自定义 custom translator 优先于内置
 */

import { describe, expect, test } from "bun:test";

import { httpError } from "../../src/errors";
import {
  isDrizzleError,
  translateDrizzleError,
} from "../../src/translator/drizzle";

const makeDrizzleError = (
  code: string
): Error & { code: string; name: string } => {
  const e = new Error(`PG error: ${code}`) as Error & {
    code: string;
    name: string;
  };
  e.name = "DrizzleError";
  e.code = code;
  return e;
};

describe("translateDrizzleError", () => {
  describe("Drizzle 内置错误码映射", () => {
    test("PG 唯一约束冲突 23505 → 409", () => {
      const out = translateDrizzleError(makeDrizzleError("23505"));
      expect(out).toBeInstanceOf(Error);
      // httpError 内部用匿名 HTTPError 子类,无法 instanceof 检测,只能断言 status 字段
      const { status } = out as { status?: number };
      expect(status).toBe(409);
    });

    test("MySQL 重复键 ER_DUP_ENTRY → 409", () => {
      const out = translateDrizzleError(makeDrizzleError("ER_DUP_ENTRY"));
      expect((out as { status?: number }).status).toBe(409);
    });

    test("SQLite 唯一约束 SQLITE_CONSTRAINT_UNIQUE → 409", () => {
      const out = translateDrizzleError(
        makeDrizzleError("SQLITE_CONSTRAINT_UNIQUE")
      );
      expect((out as { status?: number }).status).toBe(409);
    });

    test("PG 外键违反 23503 → 400", () => {
      const out = translateDrizzleError(makeDrizzleError("23503"));
      expect((out as { status?: number }).status).toBe(400);
    });

    test("MySQL 外键 ER_NO_REFERENCED_ROW_2 → 400", () => {
      const out = translateDrizzleError(
        makeDrizzleError("ER_NO_REFERENCED_ROW_2")
      );
      expect((out as { status?: number }).status).toBe(400);
    });

    test("SQLite 外键 SQLITE_CONSTRAINT_FOREIGNKEY → 400", () => {
      const out = translateDrizzleError(
        makeDrizzleError("SQLITE_CONSTRAINT_FOREIGNKEY")
      );
      expect((out as { status?: number }).status).toBe(400);
    });

    test("PG NOT NULL 违反 23502 → 422", () => {
      const out = translateDrizzleError(makeDrizzleError("23502"));
      expect((out as { status?: number }).status).toBe(422);
    });

    test("PG CHECK 约束 23514 → 422", () => {
      const out = translateDrizzleError(makeDrizzleError("23514"));
      expect((out as { status?: number }).status).toBe(422);
    });

    test("PG 连接错误 08006 → 503", () => {
      const out = translateDrizzleError(makeDrizzleError("08006"));
      expect((out as { status?: number }).status).toBe(503);
    });

    test("未知 Drizzle 错误码 → 原样返回", () => {
      const original = makeDrizzleError("99999_UNKNOWN");
      const out = translateDrizzleError(original);
      // 不命中 → 原 Error 返回
      expect(out).toBe(original);
    });
  });

  describe("非 Drizzle 错误", () => {
    test("普通 Error → 原样返回", () => {
      const original = new Error("plain error");
      const out = translateDrizzleError(original);
      expect(out).toBe(original);
    });

    test("string 错误 → 包成 Error 返回", () => {
      const out = translateDrizzleError("oops");
      expect(out).toBeInstanceOf(Error);
      expect(out.message).toBe("oops");
    });

    test("null/undefined → 包成 Error 返回", () => {
      const outNull = translateDrizzleError(null);
      expect(outNull).toBeInstanceOf(Error);

      const outUndef = translateDrizzleError(undefined);
      expect(outUndef).toBeInstanceOf(Error);
    });

    test("name 错误的类(比如手写 DrizzleErrorLike)→ 不命中,包成 Error", () => {
      const fake = { code: "23505", name: "SomeOtherError" };
      const out = translateDrizzleError(fake);
      // isDrizzleError 拒绝 + fake 非 Error 实例 → 包成 new Error
      expect(out).toBeInstanceOf(Error);
      expect(out.message).toBe(String(fake));
    });
  });

  describe("自定义 custom translator", () => {
    test("custom 在内置之前匹配,优先返回", () => {
      const customTranslator = {
        canHandle: (e: unknown) =>
          typeof e === "object" &&
          e !== null &&
          (e as { code?: string }).code === "23505",
        translate: () => httpError(418, "I'm a teapot"),
      };
      const out = translateDrizzleError(makeDrizzleError("23505"), [
        customTranslator,
      ]);
      expect((out as { status?: number }).status).toBe(418);
    });

    test("custom 不命中时,内置翻译器兜底", () => {
      const noop = {
        canHandle: () => false,
        translate: (e: unknown) => e as Error,
      };
      const out = translateDrizzleError(makeDrizzleError("23503"), [noop]);
      // 23503 由内置翻译器匹配 → 400
      expect((out as { status?: number }).status).toBe(400);
    });

    test("custom 完全没传,等价于内置翻译器直接跑", () => {
      const out = translateDrizzleError(makeDrizzleError("23505"), undefined);
      expect((out as { status?: number }).status).toBe(409);
    });
  });
});

describe("isDrizzleError", () => {
  test("DrizzleError → true", () => {
    expect(isDrizzleError({ name: "DrizzleError" })).toBe(true);
  });

  test("DrizzleQueryError → true", () => {
    expect(isDrizzleError({ name: "DrizzleQueryError" })).toBe(true);
  });

  test("其他 Error name → false", () => {
    expect(isDrizzleError(new Error("x"))).toBe(false);
    expect(isDrizzleError({ name: "OtherError" })).toBe(false);
  });

  test("null/undefined/non-object → false", () => {
    expect(isDrizzleError(null)).toBe(false);
    expect(isDrizzleError(undefined)).toBe(false);
    expect(isDrizzleError("string")).toBe(false);
    expect(isDrizzleError(42)).toBe(false);
  });
});
