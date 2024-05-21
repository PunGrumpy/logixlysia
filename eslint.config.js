import pluginJs from '@eslint/js'
import eslintPlugin from '@typescript-eslint/eslint-plugin'
import eslintPluginSimpleImportSort from 'eslint-plugin-simple-import-sort'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default [
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: globals.browser
    },
    plugins: {
      '@typescript-eslint': eslintPlugin,
      'simple-import-sort': eslintPluginSimpleImportSort
    },
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error'
    }
  }
]
