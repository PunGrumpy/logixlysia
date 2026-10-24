import { defineConfig } from 'oxfmt'
import ultracite from 'ultracite/oxfmt'

export default defineConfig({
  ...ultracite,
  arrowParens: 'avoid',
  ignorePatterns: [
    ...(ultracite.ignorePatterns ?? []),
    '**/.blume',
    '**/.snippets',
    // Vendored skills are pinned by hash in skills-lock.json, and changesets
    // writes CHANGELOG.md on every release; neither is ours to reformat.
    '.agents/**',
    '**/CHANGELOG.md'
  ],
  semi: false,
  singleQuote: true,
  sortImports: { ...ultracite.sortImports, newlinesBetween: false },
  trailingComma: 'none'
})
