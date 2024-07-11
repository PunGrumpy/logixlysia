module.exports = {
  '**/*.(ts)': () => `bun tsc --noEmit`,
  '**/*.(ts|js|cjs)': filenames => [
    `bun eslint --fix ${filenames.join(' ')}`,
    `bun format --write ${filenames.join(' ')}`
  ],
  '**/*.(md|json)': filenames => `bun format --write ${filenames.join(' ')}`
}
