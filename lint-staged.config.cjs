module.exports = {
  '**/*.(ts)': () => `bun tsc --noEmit`,
  '**/*.(ts|js|cjs)': filenames => [
    `bun eslint --fix ${filenames.join(' ')}`,
    `bun prettier --write ${filenames.join(' ')}`
  ],
  '**/*.(md|json)': filenames => `bun prettier --write ${filenames.join(' ')}`
}
