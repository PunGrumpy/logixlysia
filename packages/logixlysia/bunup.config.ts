import { rm } from 'node:fs/promises'
import path from 'node:path'
import { defineConfig } from 'bunup'
import type { BunupPlugin } from 'bunup'

const OUT_DIR = 'dist'

// bunup starts its own clean without awaiting it, so on Bun 1.4 the rm races
// the build and deletes files it just wrote (ENOENT on dist/index.js). bunup
// awaits onBuildStart hooks before building, so the clean runs here instead.
// Switch back to `clean: true` once bunup awaits its own clean.
const cleanOutDirBeforeBuild: BunupPlugin = {
  hooks: {
    onBuildStart: async () => {
      await rm(path.join(import.meta.dir, OUT_DIR), {
        force: true,
        recursive: true
      })
    }
  },
  name: 'clean-out-dir-before-build'
}

const config = defineConfig({
  clean: false,
  dts: true,
  entry: [
    'src/index.ts',
    'src/otel.ts',
    'src/enrichers.ts',
    'src/ai.ts',
    'src/axiom.ts',
    'src/hyperdx.ts',
    'src/sentry.ts',
    'src/posthog.ts',
    'src/otlp.ts',
    'src/datadog.ts',
    'src/better-stack.ts',
    'src/loki.ts',
    'src/clickhouse.ts',
    'src/desertant.ts'
  ],
  external: ['elysia', 'chalk', 'pino', 'pino-pretty'],
  format: ['esm'],
  minify: true,
  name: 'Logixlysia',
  outDir: OUT_DIR,
  plugins: [cleanOutDirBeforeBuild],
  // Pin the entry root: with 9+ entries Bun.build's inferred common root
  // nests output under dist/src/, breaking the flat dist/*.js exports paths.
  sourceBase: './src',
  sourcemap: 'inline'
})

export default config
