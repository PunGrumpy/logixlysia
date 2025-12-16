import { defineConfig } from 'bunup'

const config = defineConfig({
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

export default config
