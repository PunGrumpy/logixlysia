import elysiaPkg from 'elysia/package.json'

const centerText = (text: string, width: number): string => {
  if (text.length >= width) {
    return text.slice(0, width)
  }

  const left = Math.floor((width - text.length) / 2)
  const right = width - text.length - left
  return `${' '.repeat(left)}${text}${' '.repeat(right)}`
}

export const renderBanner = (message: string): string => {
  const versionLine = `Elysia v${elysiaPkg.version}`
  const contentWidth = Math.max(message.length, versionLine.length)
  const innerWidth = contentWidth + 4 // 2 spaces padding on both sides

  const top = `┌${'─'.repeat(innerWidth)}┐`
  const bot = `└${'─'.repeat(innerWidth)}┘`
  const empty = `│${' '.repeat(innerWidth)}│`

  const versionRow = `│${centerText(versionLine, innerWidth)}│`
  const messageRow = `│  ${message}${' '.repeat(Math.max(0, innerWidth - message.length - 4))}  │`

  return [top, empty, versionRow, empty, messageRow, empty, bot].join('\n')
}
