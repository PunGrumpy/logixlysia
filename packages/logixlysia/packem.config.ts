// packem.config.ts
import { defineConfig } from "@visulima/packem/config";
import esbuild from "@visulima/packem/transformer/esbuild";

export default defineConfig({
  declaration: true,

  entries: [
    { declaration: true, esm: true, input: "src/index.ts" },
    { declaration: true, esm: true, input: "src/otel.ts" },
    { declaration: true, esm: true, input: "src/ai.ts" },
  ],

  externals: ["elysia", "chalk", "pino", "pino-pretty"],
  failOnWarn: false,
  minify: true,

  outDir: "dist",

  rollup: {
    patchTypes: false,
  },

  runtime: "node",
  sourcemap: true,
  transformer: esbuild,
});
