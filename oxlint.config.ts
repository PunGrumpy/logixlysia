import { defineConfig } from 'oxlint'
import astro from 'ultracite/oxlint/astro'
import core from 'ultracite/oxlint/core'
import react from 'ultracite/oxlint/react'

export default defineConfig({
  extends: [core, react, astro],
  ignorePatterns: [...(core.ignorePatterns ?? []), '**/.blume'],
  overrides: [
    {
      // Scripts in .astro files run in the visitor's browser, where
      // Promise.withResolvers is too new (Safari 17.4, Chrome 119).
      files: ['**/*.astro'],
      rules: { 'promise/avoid-new': 'off' }
    }
  ],
  rules: {
    // Both autofix as "safe" but can change behaviour: catch-error-name
    // renames a `cause` binding that a later `{ cause }` shorthand reads, and
    // prefer-single-call merges separate `push` calls into one. Editors run
    // fixAll on save, so the fixes would land unreviewed.
    'unicorn/catch-error-name': 'off',
    'unicorn/prefer-single-call': 'off'
  }
})
