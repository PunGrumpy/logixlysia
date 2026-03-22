import { createRequire } from 'node:module'

const elysiaPkg: { version?: string } = (() => {
  try {
    const require = createRequire(import.meta.url)
    return require('elysia/package.json') as { version?: string }
  } catch {
    return {}
  }
})()

const logixlysiaPkg: { version?: string } = (() => {
  try {
    const require = createRequire(import.meta.url)
    return require('../../package.json') as { version?: string }
  } catch {
    return {}
  }
})()

const centerText = (text: string, width: number): string => {
  if (text.length >= width) {
    return text.slice(0, width)
  }

  const left = Math.floor((width - text.length) / 2)
  const right = width - text.length - left
  return `${' '.repeat(left)}${text}${' '.repeat(right)}`
}

type RowSpec =
  | { kind: 'empty' }
  | { kind: 'center'; text: string }
  | { kind: 'left'; text: string }

/**
 * Box banner: Elysia version (centered), URL line, optional logixlysia version line.
 */
export const renderBanner = (
  urlDisplayLine: string,
  logixlysiaLine: string | null
): string => {
  const version = elysiaPkg.version
  const versionLine = version ? `Elysia v${version}` : 'Elysia'

  const rows: RowSpec[] = [
    { kind: 'empty' },
    { kind: 'center', text: versionLine },
    { kind: 'empty' },
    { kind: 'left', text: urlDisplayLine }
  ]
  if (logixlysiaLine) {
    rows.push({ kind: 'left', text: logixlysiaLine })
  }
  rows.push({ kind: 'empty' })

  const contentWidth = Math.max(
    versionLine.length,
    urlDisplayLine.length,
    ...(logixlysiaLine ? [logixlysiaLine.length] : [0])
  )
  const innerWidth = contentWidth + 4

  const top = `┌${'─'.repeat(innerWidth)}┐`
  const bot = `└${'─'.repeat(innerWidth)}┘`
  const emptyRow = `│${' '.repeat(innerWidth)}│`

  const out: string[] = [top]
  for (const row of rows) {
    if (row.kind === 'empty') {
      out.push(emptyRow)
      continue
    }
    if (row.kind === 'center') {
      out.push(`│${centerText(row.text, innerWidth)}│`)
      continue
    }
    const text = row.text
    const padding = Math.max(0, innerWidth - text.length - 4)
    out.push(`│  ${text}${' '.repeat(padding)}  │`)
  }
  out.push(bot)
  return out.join('\n')
}

export const getLogixlysiaVersionLine = (): string | null => {
  const v = logixlysiaPkg.version
  if (!v) {
    return null
  }
  return `     logixlysia v${v}`
}
