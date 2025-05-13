import type { Options, Server } from '../interfaces'

const createBoxText = (text: string, width: number): string => {
  const paddingLength = Math.max(0, (width - text.length) / 2)
  const padding = ' '.repeat(paddingLength)
  return `${padding}${text}${padding}`.padEnd(width)
}

export default function startServer(config: Server, options?: Options): void {
  const hostname = config?.hostname ?? 'localhost'
  const port = config?.port ?? 3000
  const protocol = config?.protocol ?? 'http'
  const showBanner = options?.config?.startupMessageFormat !== 'simple'

  if (showBanner) {
    const title = 'Elysia with Logixlysia'
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
