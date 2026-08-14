import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/esbuild";
export default defineConfig({
  clean: true,
  declaration: true,
  entries: ["src/index.ts", "src/otel.ts", "src/ai.ts"],
  externals: ["elysia", "chalk", "pino", "pino-pretty"],
  minify: true,
  outDir: "dist",
  runtime: "node",
  sourcemap: true,
  transformer,
});
