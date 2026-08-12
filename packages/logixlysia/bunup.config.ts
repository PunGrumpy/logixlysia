import { defineConfig } from "bunup";

const config = defineConfig({
  dts: true,
  entry: ["src/index.ts", "src/otel.ts", "src/ai.ts"],
  external: ["elysia", "chalk", "pino", "pino-pretty"],
  format: ["esm"],
  minify: true,
  name: "Logixlysia",
  outDir: "dist",
  sourcemap: "inline",
});

export default config;


import { defineConfig } from "bunup";

const config = defineConfig({
  dts: true,
  entry: ["src/index.ts", "src/otel.ts", "src/ai.ts"],
  external: ["elysia", "chalk", "pino", "pino-pretty"],
  format: ["esm"],
  minify: process.env.NODE_ENV === "production",
  name: "Logixlysia",
  outDir: "dist",
  sourcemap: "inline",

  // 添加更精细的控制
  target: "node20",  // 指定目标环境
  shims: false,      // 不使用 shims
});

export default config;