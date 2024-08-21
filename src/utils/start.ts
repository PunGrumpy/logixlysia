import { Options, Server } from '~/types'

/**
 * Creates a box text.
 *
 * @param {string} text The text.
 * @param {number} width The box width.
 * @returns {string} The box text.
 */
const createBoxText = (text: string, width: number): string => {
  const paddingLength = Math.max(0, (width - text.length) / 2)
  const padding = ' '.repeat(paddingLength)
  return `${padding}${text}${padding}`.padEnd(width)
}

/**
 * Starts the server string.
 *
 * @param {Server} config The server configuration.
 * @returns {void} The server string.
 */
function startServer(config: Server, options?: Options): void {
  const { hostname, port, protocol } = config
  const showBanner = options?.config?.showBanner ?? true

  if (showBanner) {
    const ELYSIA_VERSION = import.meta.require('elysia/package.json').version
    const title = `Elysia v${ELYSIA_VERSION}`
    const message = `🦊 Elysia is running at ${protocol}://${hostname}:${port}`
    const boxWidth = Math.max(title.length, message.length) + 4
    const border = '─'.repeat(boxWidth)
    const emptyLine = createBoxText('', boxWidth)

    console.log(`
      ┌${border}┐
      │${emptyLine}│
      │${createBoxText(title, boxWidth)}│
      │${emptyLine}│
      │${createBoxText(message, boxWidth)}│
      │${emptyLine}│
      └${border}┘
    `)
  } else {
    console.log(`🦊 Elysia is running at ${protocol}://${hostname}:${port}`)
  }
}

export default startServer
