module.exports = {
  '**/*.(ts)': () => `tsc --noEmit`,
  '**/*.(ts|js|cjs)': filenames => [
    `eslint --fix ${filenames.join(' ')}`,
    `prettier --write ${filenames.join(' ')} --config .trunk/configs/.prettierrc.yaml`
  ],
  '**/*.(md|json)': filenames =>
    `prettier --write ${filenames.join(' ')} --config .trunk/configs/.prettierrc.yaml`
}
