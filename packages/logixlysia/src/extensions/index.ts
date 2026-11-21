import type { Options } from '../interfaces'
import { getLogixlysiaVersionLine, renderBanner } from './banner'

export const startServer = (
  server:
    | { port?: number; hostname?: string; protocol?: string | null }
    | undefined,
  options: Options
): void => {
  const showStartupMessage = options.config?.showStartupMessage ?? true
  if (!showStartupMessage) {
    return
  }

  let url: string | null = null
  if (server) {
    const { port, hostname, protocol } = server
    if (port === undefined || !hostname || !protocol) {
      return
    }
    url = `${protocol}://${hostname}:${port}`
  }

  const format = options.config?.startupMessageFormat ?? 'banner'
  if (format === 'simple') {
    console.log(url ? `🦊 Elysia is running at ${url}` : '🦊 Elysia is running')
    return
  }

  console.log(
    renderBanner(url ? `🦊  ${url}` : null, getLogixlysiaVersionLine())
  )
}
