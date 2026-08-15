import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["src/index.ts", "src/otel.ts", "src/ai.ts"],
  external: ["elysia", "chalk", "pino", "pino-pretty"],
  format: ["esm"],
  splitting: true,
  target: "es2020",
});
