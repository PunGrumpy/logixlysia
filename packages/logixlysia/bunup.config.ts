import { defineConfig } from 'bunup'

const config = defineConfig({
  name: 'Logixlysia',
  outDir: 'dist',
  entry: ['src/index.ts', 'src/otel.ts', 'src/ai.ts'],
  format: ['esm'],
  dts: true,
  minify: true,
  sourcemap: 'inline',
  external: ['elysia', 'chalk', 'pino', 'pino-pretty']
})

export default config
