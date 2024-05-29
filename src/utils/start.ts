import { Server } from '~/types'

/**
 * Creates a box text.
 *
 * @param {string} text The text.
 * @param {number} width The box width.
 *
 * @returns {string} The box text.
 */
function createBoxText(text: string, width: number): string {
  const paddingLength = Math.max(0, (width - text.length) / 2)
  const padding = ' '.repeat(paddingLength)
  return `${padding}${text}${padding}`.padEnd(width)
}

/**
 * Starts the server string.
 *
 * @param {Server} config The server configuration.
 *
 * @returns {void} The server string.
 */
function startServer(config: Server): void {
  const { hostname, port, protocol } = config
  const ELYSIA_VERSION = import.meta.require('elysia/package.json').version
  const title = `Elysia v${ELYSIA_VERSION}`
  const message = `🦊 Elysia is running at ${protocol}://${hostname}:${port}`
  const boxWidth = Math.max(title.length, message.length) + 4
  const border = '─'.repeat(boxWidth)

  console.log(`
      ┌${border}┐
      │${createBoxText('', boxWidth)}│
      │${createBoxText(title, boxWidth)}│
      │${createBoxText('', boxWidth)}│
      │${createBoxText(message, boxWidth)}│
      │${createBoxText('', boxWidth)}│
      └${border}┘
    `)
}

export default startServer
