import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/esbuild";

export default defineConfig({
  externals: ["elysia", "chalk", "pino", "pino-pretty"],
  failOnWarn: false,
  rollup: {
    patchTypes: false,
  },
  runtime: "node",
  sourcemap: false,
  transformer,
});
