import { STATUS_CODES } from 'node:http'
import chalk from 'chalk'
import { getStatusCode } from '../helpers/status'
import type {
  LogLevel,
  Options,
  Pino,
  RequestInfo,
  StoreData
} from '../interfaces'
import { parseError } from '../utils/error'

const pad2 = (value: number): string => String(value).padStart(2, '0')
const pad3 = (value: number): string => String(value).padStart(3, '0')

const DEFAULT_SLOW_MS = 500
const DEFAULT_VERY_SLOW_MS = 1000
const METHOD_PAD = 7

const DEFAULT_LOG_FORMAT =
  '{now} {service}{icon} {method} {pathname} {status} {duration} {message}{speed}'

export interface FormattedLogOutput {
  main: string
  contextLines: string[]
}

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

/** Resolves client IP from x-forwarded-for (first IP) or x-real-ip. Empty when neither header is set (e.g. localhost). */
const getIp = (request: RequestInfo): string => {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() ?? ''
  }
  return request.headers.get('x-real-ip') ?? ''
}

export const formatDuration = (ms: number): string => {
  if (ms >= 1000) {
    const sec = ms / 1000
    if (sec >= 10) {
      return `${Math.round(sec)}s`
    }
    const oneDecimal = sec.toFixed(1)
    return oneDecimal.endsWith('.0') ? `${Math.round(sec)}s` : `${oneDecimal}s`
  }
  if (ms > 0 && ms < 1) {
    return `${ms.toFixed(2)}ms`
  }
  return `${Math.round(ms)}ms`
}

const getSlowThresholds = (
  options: Options
): { slow: number; verySlow: number } => {
  const config = options.config
  return {
    slow: config?.slowThreshold ?? DEFAULT_SLOW_MS,
    verySlow: config?.verySlowThreshold ?? DEFAULT_VERY_SLOW_MS
  }
}

const colorDurationText = (
  ms: number,
  useColors: boolean,
  options: Options
): { text: string; isVerySlow: boolean } => {
  const raw = formatDuration(ms)
  const { slow, verySlow } = getSlowThresholds(options)
  const isVerySlow = ms >= verySlow

  if (!useColors) {
    return { text: raw, isVerySlow }
  }

  let colored = raw
  if (ms < slow) {
    colored = chalk.green(raw)
  } else if (ms < verySlow) {
    colored = chalk.yellow(raw)
  } else {
    colored = chalk.red.bold(raw)
  }

  return { text: colored, isVerySlow }
}

const getSpeedToken = (isVerySlow: boolean, useColors: boolean): string => {
  if (!isVerySlow) {
    return ''
  }
  const badge = '⚡ slow'
  if (!useColors) {
    return ` ${badge}`
  }
  return ` ${chalk.yellow(badge)}`
}

/** Logixlysia brand: fox emoji with level-colored background when colors are enabled. */
const getLevelIcon = (level: LogLevel, useColors: boolean): string => {
  if (!useColors) {
    return '🦊'
  }
  if (level === 'ERROR') {
    return chalk.bgRed.black(' 🦊 ')
  }
  if (level === 'WARNING') {
    return chalk.bgYellow.black(' 🦊 ')
  }
  if (level === 'DEBUG') {
    return chalk.bgBlue.black(' 🦊 ')
  }
  return chalk.bgGreen.black(' 🦊 ')
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

const getColoredTimestamp = (timestamp: string, useColors: boolean): string => {
  if (!useColors) {
    return timestamp
  }

  return chalk.gray(timestamp)
}

const getColoredPathname = (pathname: string, useColors: boolean): string => {
  if (!useColors) {
    return pathname
  }

  return chalk.whiteBright(pathname)
}

const getStatusText = (statusCode: number): string => {
  const text = STATUS_CODES[statusCode]
  return text ?? ''
}

const getServiceToken = (options: Options, useColors: boolean): string => {
  const name = options.config?.service?.trim()
  if (!name) {
    return ''
  }
  const bracketed = `[${name}]`
  if (!useColors) {
    return `${bracketed} `
  }
  return `${chalk.dim(bracketed)} `
}

const stringifyTreeValue = (value: unknown): string => {
  if (value === null) {
    return 'null'
  }
  if (value === undefined) {
    return 'undefined'
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (value instanceof Error) {
    return value.message
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/** Nested objects to expand in the context tree (excludes Arrays, Error, Date). */
const isExpandableObject = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  !(value instanceof Error) &&
  !(value instanceof Date)

const collectContextEntries = (
  obj: Record<string, unknown>,
  prefix: string,
  depthRemaining: number
): [string, string][] => {
  const out: [string, string][] = []
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    const expandable = isExpandableObject(v) && depthRemaining > 1

    if (expandable) {
      out.push(...collectContextEntries(v, key, depthRemaining - 1))
    } else {
      out.push([key, stringifyTreeValue(v)])
    }
  }
  return out
}

const formatEntriesToTreeLines = (
  entries: [string, string][],
  useColors: boolean
): string[] => {
  if (entries.length === 0) {
    return []
  }

  const lines: string[] = []
  const last = entries.length - 1
  for (let i = 0; i < entries.length; i++) {
    const branch = i === last ? '└─' : '├─'
    const pair = entries[i]
    if (!pair) {
      continue
    }
    const [k, v] = pair
    const keyPart = useColors ? chalk.cyan(k) : k
    const valPart = useColors ? chalk.white(v) : v
    lines.push(`  ${branch} ${keyPart}  ${valPart}`)
  }
  return lines
}

export const renderContextTreeLines = (
  ctx: Record<string, unknown>,
  options: Options,
  useColors: boolean
): string[] => {
  const depth = options.config?.contextDepth ?? 1
  if (depth < 1) {
    return []
  }

  const entries = collectContextEntries(ctx, '', depth)
  return formatEntriesToTreeLines(entries, useColors)
}

export const buildContextTreeLines = (
  level: LogLevel,
  data: Record<string, unknown>,
  options: Options
): string[] => {
  if (options.config?.showContextTree === false) {
    return []
  }

  const useColors = shouldUseColors(options)
  const depth = options.config?.contextDepth ?? 1

  const entries: [string, string][] = []

  const ctx = data.context
  if (
    ctx &&
    typeof ctx === 'object' &&
    !Array.isArray(ctx) &&
    Object.keys(ctx as object).length > 0 &&
    depth >= 1
  ) {
    entries.push(
      ...collectContextEntries(ctx as Record<string, unknown>, '', depth)
    )
  }

  if (level === 'ERROR' && 'error' in data && data.error !== undefined) {
    const msg = parseError(data.error)
    if (msg) {
      entries.push(['error', msg])
    }
  }

  return formatEntriesToTreeLines(entries, useColors)
}

const getContextString = (value: unknown): string => {
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value)
  }

  return ''
}

export const formatLogOutput = ({
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
}): FormattedLogOutput => {
  const config = options.config
  const useColors = shouldUseColors(options)
  const format = config?.customLogFormat ?? DEFAULT_LOG_FORMAT

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

  const showTree = config?.showContextTree !== false
  const ctxString =
    showTree &&
    data.context &&
    typeof data.context === 'object' &&
    !Array.isArray(data.context) &&
    Object.keys(data.context as object).length > 0
      ? ''
      : getContextString(data.context)

  const coloredLevel = getColoredLevel(level, useColors)
  const methodPadded = request.method.toUpperCase().padEnd(METHOD_PAD)
  const coloredMethod = getColoredMethod(methodPadded, useColors)
  const coloredPathname = getColoredPathname(pathname, useColors)
  const coloredStatus = getColoredStatus(status, useColors)
  const { text: coloredDuration, isVerySlow } = colorDurationText(
    durationMs,
    useColors,
    options
  )
  const speedToken = getSpeedToken(isVerySlow, useColors)
  const icon = getLevelIcon(level, useColors)
  const statusText = getStatusText(statusCode)
  const serviceToken = getServiceToken(options, useColors)

  const main = format
    .replaceAll('{now}', timestamp)
    .replaceAll('{epoch}', epoch)
    .replaceAll('{level}', coloredLevel)
    .replaceAll('{icon}', icon)
    .replaceAll('{duration}', coloredDuration)
    .replaceAll('{method}', coloredMethod)
    .replaceAll('{pathname}', coloredPathname)
    .replaceAll('{path}', coloredPathname)
    .replaceAll('{status}', coloredStatus)
    .replaceAll('{statusText}', statusText)
    .replaceAll('{message}', message)
    .replaceAll('{ip}', ip)
    .replaceAll('{context}', ctxString)
    .replaceAll('{service}', serviceToken)
    .replaceAll('{speed}', speedToken)

  const contextLines = buildContextTreeLines(level, data, options)

  return { main, contextLines }
}

/** @deprecated Prefer {@link formatLogOutput} for multi-line context trees. Returns the main line only. */
export const formatLine = (input: {
  level: LogLevel
  request: RequestInfo
  data: Record<string, unknown>
  store: StoreData
  options: Options
}): string =>
  formatLogOutput({
    ...input,
    options: {
      ...input.options,
      config: {
        ...(input.options.config ?? {}),
        showContextTree: false
      }
    }
  }).main

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
