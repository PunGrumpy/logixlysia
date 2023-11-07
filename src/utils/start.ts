interface Server {
  hostname?: string
  port?: number
  protocol?: string
}

function createBoxText(text: string, width: number): string {
  const padding = ' '.repeat((width - text.length) / 2)
  return `${padding}${text}${padding}`
}

function startString(config: Server): void {
  const { hostname, port, protocol } = config
  const ELYSIA_VERSION = import.meta.require('elysia/package.json').version
  const title = `Elysia v${ELYSIA_VERSION}`
  const message = `🦊 Elysia is running at ${protocol}://${hostname}:${port}`
  const messageWidth = message.length
  const boxWidth = Math.max(title.length, messageWidth) + 4
  const border = '─'.repeat(boxWidth)

  process.stdout.write('\x1Bc')

  console.log(`
      ┌${border}┐
      │${createBoxText('', boxWidth)} │
      │${createBoxText(title, boxWidth)} │
      │${createBoxText('', boxWidth)} │
      │${createBoxText(message, boxWidth)}│
      │${createBoxText('', boxWidth)} │
      └${border}┘
    `)
}

export { Server, startString }
