import { STATUS_CODES } from 'node:http'
import chalk from 'chalk'
import { getStatusCode } from '../helpers/status'
import type { LogLevel, Options, RequestInfo, StoreData } from '../interfaces'
import { isStructuredError, parseError } from '../utils/error'
import { sanitizeLogText } from '../utils/sanitize'

const pad2 = (value: number): string => String(value).padStart(2, '0')
const pad3 = (value: number): string => String(value).padStart(3, '0')

const DEFAULT_SLOW_MS = 500
const DEFAULT_VERY_SLOW_MS = 1000
const METHOD_PAD = 7

const DEFAULT_LOG_FORMAT =
  '{now} {service}{icon} {method} {pathname} {status} {duration} {message}{speed}'

const LOG_FORMAT_REGEX =
  /\{(now|epoch|level|icon|duration|method|pathname|path|query|status|statusText|message|ip|context|service|speed|requestId)\}/g

export interface FormattedLogOutput {
  contextLines: string[]
  main: string
}

const shouldUseColors = (options: Options): boolean => {
  const { config } = options
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
  const candidate = forwarded
    ? (forwarded.split(',')[0]?.trim() ?? '')
    : (request.headers.get('x-real-ip') ?? '')
  return sanitizeLogText(candidate, 64)
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
  const { config } = options
  return {
    slow: config?.slowThreshold ?? DEFAULT_SLOW_MS,
    verySlow: config?.verySlowThreshold ?? DEFAULT_VERY_SLOW_MS
  }
}

const colorDurationText = (
  ms: number,
  useColors: boolean,
  slow: number,
  verySlow: number
): { text: string; isVerySlow: boolean } => {
  const raw = formatDuration(ms)
  const isVerySlow = ms >= verySlow

  if (!useColors) {
    return { isVerySlow, text: raw }
  }

  let colored = raw
  if (ms < slow) {
    colored = chalk.green(raw)
  } else if (ms < verySlow) {
    colored = chalk.yellow(raw)
  } else {
    colored = chalk.red.bold(raw)
  }

  return { isVerySlow, text: colored }
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

export interface FormatContext {
  format: string
  serviceToken: string
  slowThreshold: number
  /** Format tokens actually present in `format` (see {@link LOG_FORMAT_REGEX}). */
  tokens: Set<string>
  useColors: boolean
  verySlowThreshold: number
}

/**
 * Resolves colors/format/thresholds/service once per logger instance instead of per log line.
 * Safe to hoist: TTY-ness and config don't change across a process's lifetime, so freezing the
 * colors decision at construction time matches real process lifecycles.
 *
 * NOTE: adding a new format token requires adding it both to {@link LOG_FORMAT_REGEX} and to the
 * token-gating checks in {@link formatLogOutput} below.
 */
export const createFormatContext = (options: Options): FormatContext => {
  const { config } = options
  const useColors = shouldUseColors(options)
  const format = config?.customLogFormat ?? DEFAULT_LOG_FORMAT
  const tokens = new Set(format.match(LOG_FORMAT_REGEX) ?? [])
  const { slow: slowThreshold, verySlow: verySlowThreshold } =
    getSlowThresholds(options)
  const serviceToken = getServiceToken(options, useColors)

  return {
    format,
    serviceToken,
    slowThreshold,
    tokens,
    useColors,
    verySlowThreshold
  }
}

const stringifyTreeValue = (value: unknown): string => {
  if (value === null) {
    return 'null'
  }
  if (value === undefined) {
    return 'undefined'
  }
  if (typeof value === 'string') {
    return sanitizeLogText(value)
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (value instanceof Error) {
    return sanitizeLogText(value.message)
  }
  try {
    return sanitizeLogText(JSON.stringify(value))
  } catch {
    return sanitizeLogText(String(value))
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
  for (let i = 0; i < entries.length; i += 1) {
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

const collectStructuredErrorEntries = (error: unknown): [string, string][] => {
  const entries: [string, string][] = []
  const msg = parseError(error)
  if (msg) {
    entries.push(['error', msg])
  }
  if (isStructuredError(error)) {
    if (error.code !== undefined) {
      entries.push(['error.code', String(error.code)])
    }
    if (error.why !== undefined) {
      entries.push(['error.why', String(error.why)])
    }
    if (error.fix !== undefined) {
      entries.push(['error.fix', String(error.fix)])
    }
    if (error.link !== undefined) {
      entries.push(['error.link', String(error.link)])
    }
    if (error.internal !== undefined) {
      entries.push(['error.internal', stringifyTreeValue(error.internal)])
    }
  }
  return entries
}

export const buildContextTreeLines = (
  level: LogLevel,
  data: Record<string, unknown>,
  options: Options,
  useColors: boolean = shouldUseColors(options)
): string[] => {
  if (options.config?.showContextTree === false) {
    return []
  }

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

  // WARNING as well as ERROR: a 4xx is logged at WARNING, and its
  // `why`/`fix`/`link` are exactly as worth showing as a 5xx's.
  if ((level === 'ERROR' || level === 'WARNING') && data.error !== undefined) {
    entries.push(...collectStructuredErrorEntries(data.error))
  }

  return formatEntriesToTreeLines(entries, useColors)
}

const getContextString = (value: unknown): string => {
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value)
  }

  return ''
}

/** Raw duration/URL parts computed once per log emission by the caller (see `logger/index.ts`). */
export interface PrecomputedLogParts {
  durationMs: number
  pathname: string
  search: string
}

/** `{now}`/`{epoch}` share a single `Date` sample; each is only formatted when requested. */
const getTimestampTokens = (
  tokens: Set<string>,
  translateTime: string | undefined,
  useColors: boolean
): { timestamp: string; epoch: string } => {
  if (!(tokens.has('{now}') || tokens.has('{epoch}'))) {
    return { epoch: '', timestamp: '' }
  }
  const now = new Date()
  const epoch = tokens.has('{epoch}') ? String(now.getTime()) : ''
  if (!tokens.has('{now}')) {
    return { epoch, timestamp: '' }
  }
  const rawTimestamp = formatTimestamp(now, translateTime)
  return { epoch, timestamp: getColoredTimestamp(rawTimestamp, useColors) }
}

const getMessageToken = (
  tokens: Set<string>,
  data: Record<string, unknown>
): string => {
  if (!tokens.has('{message}')) {
    return ''
  }
  return typeof data.message === 'string' ? data.message : ''
}

/** `{pathname}`/`{path}`/`{query}` share a single URL parse (or the precomputed one). */
const getPathnameTokens = (
  tokens: Set<string>,
  request: RequestInfo,
  config: Options['config'],
  useColors: boolean,
  precomputed?: PrecomputedLogParts
): { coloredPathname: string; query: string } => {
  const needsPathname = tokens.has('{pathname}') || tokens.has('{path}')
  const needsQuery = tokens.has('{query}')
  if (!(needsPathname || needsQuery)) {
    return { coloredPathname: '', query: '' }
  }

  let rawPathname: string
  let search: string
  if (precomputed) {
    ;({ pathname: rawPathname, search } = precomputed)
  } else {
    try {
      ;({ pathname: rawPathname, search } = new URL(request.url))
    } catch {
      rawPathname = request.url || '/'
      search = ''
    }
  }

  const query = needsQuery ? search : ''
  if (!needsPathname) {
    return { coloredPathname: '', query }
  }
  const pathname = config?.logQueryParams
    ? `${rawPathname}${search}`
    : rawPathname
  return { coloredPathname: getColoredPathname(pathname, useColors), query }
}

/** `{status}`/`{statusText}` share a single status-code resolution. */
const getStatusTokens = (
  tokens: Set<string>,
  data: Record<string, unknown>,
  useColors: boolean
): { coloredStatus: string; statusText: string } => {
  const needsStatus = tokens.has('{status}')
  const needsStatusText = tokens.has('{statusText}')
  if (!(needsStatus || needsStatusText)) {
    return { coloredStatus: '', statusText: '' }
  }
  const statusValue = data.status
  const statusCode =
    statusValue === null || statusValue === undefined
      ? 200
      : getStatusCode(statusValue)
  return {
    coloredStatus: needsStatus
      ? getColoredStatus(String(statusCode), useColors)
      : '',
    statusText: needsStatusText ? getStatusText(statusCode) : ''
  }
}

const getIpToken = (
  tokens: Set<string>,
  request: RequestInfo,
  config: Options['config']
): string => (config?.ip === true && tokens.has('{ip}') ? getIp(request) : '')

const hasNonEmptyContext = (
  context: unknown
): context is Record<string, unknown> =>
  context !== null &&
  context !== undefined &&
  typeof context === 'object' &&
  !Array.isArray(context) &&
  Object.keys(context as object).length > 0

const getContextToken = (
  tokens: Set<string>,
  data: Record<string, unknown>,
  config: Options['config']
): string => {
  if (!tokens.has('{context}')) {
    return ''
  }
  const showTree = config?.showContextTree !== false
  if (showTree && hasNonEmptyContext(data.context)) {
    return ''
  }
  return getContextString(data.context)
}

/** `{duration}`/`{speed}` share a single duration sample and slow-threshold check. */
const getDurationTokens = (
  tokens: Set<string>,
  store: StoreData,
  useColors: boolean,
  slowThreshold: number,
  verySlowThreshold: number,
  precomputed?: PrecomputedLogParts
): { coloredDuration: string; speedToken: string } => {
  const needsDuration = tokens.has('{duration}')
  const needsSpeed = tokens.has('{speed}')
  if (!(needsDuration || needsSpeed)) {
    return { coloredDuration: '', speedToken: '' }
  }
  const durationMs =
    precomputed?.durationMs ??
    (store.beforeTime === BigInt(0)
      ? 0
      : Number(process.hrtime.bigint() - store.beforeTime) / 1_000_000)
  const { text, isVerySlow } = colorDurationText(
    durationMs,
    useColors,
    slowThreshold,
    verySlowThreshold
  )
  return {
    coloredDuration: needsDuration ? text : '',
    speedToken: needsSpeed ? getSpeedToken(isVerySlow, useColors) : ''
  }
}

const getRequestIdToken = (
  tokens: Set<string>,
  data: Record<string, unknown>
): string => {
  if (!tokens.has('{requestId}')) {
    return ''
  }
  const ctx = data.context
  if (typeof ctx !== 'object' || ctx === null || !('requestId' in ctx)) {
    return ''
  }
  return String((ctx as Record<string, unknown>).requestId)
}

export const formatLogOutput = ({
  level,
  request,
  data,
  store,
  options,
  formatContext,
  precomputed
}: {
  level: LogLevel
  request: RequestInfo
  data: Record<string, unknown>
  store: StoreData
  options: Options
  /** Hoisted per-logger constants; computed on the fly when a direct caller omits it. */
  formatContext?: FormatContext
  /** Duration/URL parts already computed by the caller; parsed on the fly when omitted. */
  precomputed?: PrecomputedLogParts
}): FormattedLogOutput => {
  const { config } = options
  const {
    format,
    serviceToken,
    slowThreshold,
    tokens,
    useColors,
    verySlowThreshold
  } = formatContext ?? createFormatContext(options)

  const { timestamp, epoch } = getTimestampTokens(
    tokens,
    config?.timestamp?.translateTime,
    useColors
  )
  const message = getMessageToken(tokens, data)
  const { coloredPathname, query } = getPathnameTokens(
    tokens,
    request,
    config,
    useColors,
    precomputed
  )
  const { coloredStatus, statusText } = getStatusTokens(tokens, data, useColors)
  const ip = getIpToken(tokens, request, config)
  const ctxString = getContextToken(tokens, data, config)
  const coloredLevel = tokens.has('{level}')
    ? getColoredLevel(level, useColors)
    : ''
  const coloredMethod = tokens.has('{method}')
    ? getColoredMethod(
        request.method.toUpperCase().padEnd(METHOD_PAD),
        useColors
      )
    : ''
  const { coloredDuration, speedToken } = getDurationTokens(
    tokens,
    store,
    useColors,
    slowThreshold,
    verySlowThreshold,
    precomputed
  )
  const icon = tokens.has('{icon}') ? getLevelIcon(level, useColors) : ''
  const requestId = getRequestIdToken(tokens, data)

  const tokenMap: Record<string, string> = {
    '{context}': ctxString,
    '{duration}': coloredDuration,
    '{epoch}': epoch,
    '{icon}': icon,
    '{ip}': ip,
    '{level}': coloredLevel,
    '{message}': message,
    '{method}': coloredMethod,
    '{now}': timestamp,
    '{path}': coloredPathname,
    '{pathname}': coloredPathname,
    '{query}': query,
    '{requestId}': requestId,
    '{service}': serviceToken,
    '{speed}': speedToken,
    '{status}': coloredStatus,
    '{statusText}': statusText
  }

  const main = format.replace(
    LOG_FORMAT_REGEX,
    match => tokenMap[match] ?? match
  )

  const contextLines = buildContextTreeLines(level, data, options, useColors)

  return { contextLines, main }
}
