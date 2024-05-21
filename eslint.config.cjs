const eslintConfig = [
  {
    files: ['*.ts', '*.tsx'],
    languageOptions: {
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      }
    },
    plugins: {
      '@typescript-eslint': require('@typescript-eslint/eslint-plugin')
    },
    rules: {
      '@typescript-eslint/ban-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-extra-semi': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-var-requires': 'error',
      'no-mixed-spaces-and-tabs': 'off',
      'no-case-declarations': 'off',
      'no-extra-semi': 'off'
    }
  },
  {
    files: ['*.js', '*.cjs', '*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module'
    },
    rules: {
      'no-mixed-spaces-and-tabs': 'off',
      'no-case-declarations': 'off',
      'no-extra-semi': 'off'
    }
  }
]

module.exports = eslintConfig
