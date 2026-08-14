import { defineConfig } from "bunup";

const config = defineConfig({
  dts: {
    // 让 @bunup/dts 走 TS 编译器做完整类型推导,而不是把函数体当 JS 走 AST 推成 unknown。
    // 没有这行,`new Elysia()...as("global")` 的返回类型会退化成 `unknown`,
    // `type Logixlysia = ReturnType<typeof logixlysia>` 也跟着变 unknown。
    inferTypes: true,
  },
  entry: ["src/index.ts", "src/otel.ts", "src/ai.ts"],
  external: ["elysia", "chalk", "pino", "pino-pretty"],
  format: ["esm"],
  minify: true,
  name: "Logixlysia",
  outDir: "dist",
  sourcemap: "inline",
});

export default config;
