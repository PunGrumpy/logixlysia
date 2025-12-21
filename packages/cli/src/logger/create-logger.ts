import chalk from 'chalk'
import { getStatusCode } from '../helpers/status'
import type {
  LogLevel,
  Options,
  Pino,
  RequestInfo,
  StoreData
} from '../interfaces'

const pad2 = (value: number): string => String(value).padStart(2, '0')
const pad3 = (value: number): string => String(value).padStart(3, '0')

const shouldUseColors = (options: Options): boolean => {
  const config = options.config
  const enabledByConfig = config?.useColors ?? true

  // Avoid ANSI sequences in non-interactive output (pipes, CI logs, files).
  const isTty = typeof process !== 'undefined' && process.stdout?.isTTY === true
  return enabledByConfig && isTty
}

const formatTimestamp = (date: Date, pattern?: string): string => {
  if (!pattern) {
    return date.toISOString()
  }

  const yyyy = String(date.getFullYear())
  const mm = pad2(date.getMonth() + 1)
  const dd = pad2(date.getDate())
  const HH = pad2(date.getHours())
  const MM = pad2(date.getMinutes())
  const ss = pad2(date.getSeconds())
  const SSS = pad3(date.getMilliseconds())

  return pattern
    .replaceAll('yyyy', yyyy)
    .replaceAll('mm', mm)
    .replaceAll('dd', dd)
    .replaceAll('HH', HH)
    .replaceAll('MM', MM)
    .replaceAll('ss', ss)
    .replaceAll('SSS', SSS)
}

const getIp = (request: RequestInfo): string => {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() ?? ''
  }
  return request.headers.get('x-real-ip') ?? ''
}

const getColoredLevel = (level: LogLevel, useColors: boolean): string => {
  if (!useColors) {
    return level
  }

  if (level === 'ERROR') {
    return chalk.bgRed.black(level)
  }
  if (level === 'WARNING') {
    return chalk.bgYellow.black(level)
  }
  if (level === 'DEBUG') {
    return chalk.bgBlue.black(level)
  }

  return chalk.bgGreen.black(level)
}

const getColoredMethod = (method: string, useColors: boolean): string => {
  if (!useColors) {
    return method
  }

  const upper = method.toUpperCase()
  if (upper === 'GET') {
    return chalk.green.bold(upper)
  }
  if (upper === 'POST') {
    return chalk.blue.bold(upper)
  }
  if (upper === 'PUT') {
    return chalk.yellow.bold(upper)
  }
  if (upper === 'PATCH') {
    return chalk.yellowBright.bold(upper)
  }
  if (upper === 'DELETE') {
    return chalk.red.bold(upper)
  }
  if (upper === 'OPTIONS') {
    return chalk.cyan.bold(upper)
  }
  if (upper === 'HEAD') {
    return chalk.greenBright.bold(upper)
  }
  if (upper === 'TRACE') {
    return chalk.magenta.bold(upper)
  }
  if (upper === 'CONNECT') {
    return chalk.cyanBright.bold(upper)
  }

  return chalk.white.bold(upper)
}

const getColoredStatus = (status: string, useColors: boolean): string => {
  if (!useColors) {
    return status
  }

  const numeric = Number.parseInt(status, 10)
  if (!Number.isFinite(numeric)) {
    return status
  }

  if (numeric >= 500) {
    return chalk.red(status)
  }
  if (numeric >= 400) {
    return chalk.yellow(status)
  }
  if (numeric >= 300) {
    return chalk.cyan(status)
  }
  if (numeric >= 200) {
    return chalk.green(status)
  }
  return chalk.gray(status)
}

const getColoredDuration = (duration: string, useColors: boolean): string => {
  if (!useColors) {
    return duration
  }

  return chalk.gray(duration)
}

const getColoredTimestamp = (timestamp: string, useColors: boolean): string => {
  if (!useColors) {
    return timestamp
  }

  return chalk.bgHex('#FFA500').black(timestamp)
}

const getColoredPathname = (pathname: string, useColors: boolean): string => {
  if (!useColors) {
    return pathname
  }

  return chalk.whiteBright(pathname)
}

const getContextString = (value: unknown): string => {
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value)
  }

  return ''
}

export const formatLine = ({
  level,
  request,
  data,
  store,
  options
}: {
  level: LogLevel
  request: RequestInfo
  data: Record<string, unknown>
  store: StoreData
  options: Options
}): string => {
  const config = options.config
  const useColors = shouldUseColors(options)
  const format =
    config?.customLogFormat ??
    '🦊 {now} {level} {duration} {method} {pathname} {status} {message} {ip} {context}'

  const now = new Date()
  const epoch = String(now.getTime())
  const rawTimestamp = formatTimestamp(now, config?.timestamp?.translateTime)
  const timestamp = getColoredTimestamp(rawTimestamp, useColors)

  const message = typeof data.message === 'string' ? data.message : ''
  const durationMs =
    store.beforeTime === BigInt(0)
      ? 0
      : Number(process.hrtime.bigint() - store.beforeTime) / 1_000_000

  const pathname = new URL(request.url).pathname
  const statusValue = data.status
  const statusCode =
    statusValue === null || statusValue === undefined
      ? 200
      : getStatusCode(statusValue)
  const status = String(statusCode)
  const ip = config?.ip === true ? getIp(request) : ''
  const ctxString = getContextString(data.context)
  const coloredLevel = getColoredLevel(level, useColors)
  const coloredMethod = getColoredMethod(request.method, useColors)
  const coloredPathname = getColoredPathname(pathname, useColors)
  const coloredStatus = getColoredStatus(status, useColors)
  const coloredDuration = getColoredDuration(
    `${durationMs.toFixed(2)}ms`,
    useColors
  )

  return format
    .replaceAll('{now}', timestamp)
    .replaceAll('{epoch}', epoch)
    .replaceAll('{level}', coloredLevel)
    .replaceAll('{duration}', coloredDuration)
    .replaceAll('{method}', coloredMethod)
    .replaceAll('{pathname}', coloredPathname)
    .replaceAll('{path}', coloredPathname)
    .replaceAll('{status}', coloredStatus)
    .replaceAll('{message}', message)
    .replaceAll('{ip}', ip)
    .replaceAll('{context}', ctxString)
}

export const logWithPino = (
  logger: Pino,
  level: LogLevel,
  data: Record<string, unknown>
): void => {
  if (level === 'ERROR') {
    logger.error(data)
    return
  }
  if (level === 'WARNING') {
    logger.warn(data)
    return
  }
  if (level === 'DEBUG') {
    logger.debug(data)
    return
  }
  logger.info(data)
}
