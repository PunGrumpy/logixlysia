import { defineConfig } from "bunup";

const config = defineConfig({
  dts: true,
  entry: ["src/index.ts"],
  external: ["elysia", "chalk", "pino", "pino-pretty"],
  format: ["esm"],
  minify: true,
  name: "Logixlysia",
  outDir: "dist",
  sourcemap: "inline",
});

export default config;
