import { defineConfig } from 'oxlint'
import astro from 'ultracite/oxlint/astro'
import core from 'ultracite/oxlint/core'
import react from 'ultracite/oxlint/react'

export default defineConfig({
  extends: [core, react, astro],
  ignorePatterns: [...(core.ignorePatterns ?? []), '**/.blume']
})
