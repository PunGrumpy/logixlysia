import { defineConfig } from 'bunup'

const config = defineConfig({
  dts: true,
  entry: [
    'src/index.ts',
    'src/otel.ts',
    'src/ai.ts',
    'src/axiom.ts',
    'src/hyperdx.ts',
    'src/sentry.ts',
    'src/posthog.ts',
    'src/otlp.ts',
    'src/datadog.ts'
  ],
  external: ['elysia', 'chalk', 'pino', 'pino-pretty'],
  format: ['esm'],
  minify: true,
  name: 'Logixlysia',
  outDir: 'dist',
  // Pin the entry root: with 9+ entries Bun.build's inferred common root
  // nests output under dist/src/, breaking the flat dist/*.js exports paths.
  sourceBase: './src',
  sourcemap: 'inline'
})

export default config
