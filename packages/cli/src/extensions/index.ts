import type { Options } from '../interfaces'
import { renderBanner } from './banner'

export const startServer = (
  server: { port?: number; hostname?: string; protocol?: string | null },
  options: Options
): void => {
  const showStartupMessage = options.config?.showStartupMessage ?? true
  if (!showStartupMessage) {
    return
  }

  const { port, hostname, protocol } = server
  if (port === undefined || !hostname || !protocol) {
    return
  }

  const url = `${protocol}://${hostname}:${port}`
  const message = `🦊 Elysia is running at ${url}`

  const format = options.config?.startupMessageFormat ?? 'banner'
  if (format === 'simple') {
    console.log(message)
    return
  }

  console.log(renderBanner(message))
}
