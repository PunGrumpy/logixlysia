// CommonJS on purpose. Bundlers follow a require() in a CommonJS module, so a
// bundled app still contains pino, and the require() still runs only on first
// call. bunup turns a require() in the ESM build into
// createRequire(import.meta.url), which bundlers do not follow.
/* oxlint-disable node/global-require -- deferring require() is the point */
const loadPino = () => require('pino')
const loadPretty = () => require('pino-pretty')

module.exports = { loadPino, loadPretty }
