import { createRequire } from 'node:module'

const elysiaPkg: { version?: string } = (() => {
  try {
    const require = createRequire(import.meta.url)
    return require('elysia/package.json') as { version?: string }
  } catch {
    return {}
  }
})()

const OWN_PACKAGE_PATHS = ['../package.json', '../../package.json']

const logixlysiaPkg: { version?: string } = (() => {
  const require = createRequire(import.meta.url)
  for (const path of OWN_PACKAGE_PATHS) {
    try {
      const pkg = require(path) as { name?: string; version?: string }
      if (pkg.name === 'logixlysia') {
        return pkg
      }
    } catch {
      // Not at this depth; try the next one.
    }
  }
  return {}
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

export const renderBanner = (
  urlDisplayLine: string | null,
  logixlysiaLine: string | null
): string => {
  const { version } = elysiaPkg
  const versionLine = version ? `Elysia v${version}` : 'Elysia'

  const rows: RowSpec[] = [
    { kind: 'empty' },
    { kind: 'center', text: versionLine },
    { kind: 'empty' }
  ]
  if (urlDisplayLine) {
    rows.push({ kind: 'left', text: urlDisplayLine })
  }
  if (logixlysiaLine) {
    rows.push(
      urlDisplayLine
        ? { kind: 'left', text: logixlysiaLine }
        : { kind: 'center', text: logixlysiaLine.trim() }
    )
  }
  rows.push({ kind: 'empty' })

  const contentWidth = Math.max(
    versionLine.length,
    urlDisplayLine?.length ?? 0,
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
    const { text } = row
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
