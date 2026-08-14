import { defineConfig } from "@visulima/packem/config";
import transformer from '@visulima/packem/transformer/esbuild'
export default defineConfig({
  runtime: "node",
  transformer,
  entries: ["src/index.ts", "src/otel.ts", "src/ai.ts"],
  outDir: "dist",
  externals: ['elysia', 'chalk', 'pino', 'pino-pretty'],
  minify: true,
  sourcemap: true,
  clean: true,
  declaration: true
});
