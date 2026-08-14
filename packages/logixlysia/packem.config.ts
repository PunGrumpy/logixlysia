import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/esbuild";
export default defineConfig({
  declaration: true,
  entries: ["src/index.ts", "src/otel.ts", "src/ai.ts"],
  externals: ["elysia", "chalk", "pino", "pino-pretty"],
  failOnWarn: false,
  minify: false,
  outDir: "dist",
  runtime: "node",
  transformer,
});
