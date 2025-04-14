import { defineConfig } from 'bunup'

export default defineConfig({
  name: 'Logixlysia',
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: 'inline',
  clean: true,
  minify: true,
  external: ['elysia', 'chalk']
})
