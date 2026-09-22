import { defineConfig } from 'oxfmt'
import ultracite from 'ultracite/oxfmt'

// Keeps the style the repo had under Biome, so the switch does not reformat
// every file: single quotes, no semicolons, no trailing commas, `x => x`.
export default defineConfig({
  ...ultracite,
  arrowParens: 'avoid',
  ignorePatterns: [...(ultracite.ignorePatterns ?? []), '**/.blume'],
  semi: false,
  singleQuote: true,
  sortImports: { ...ultracite.sortImports, newlinesBetween: false },
  trailingComma: 'none'
})
