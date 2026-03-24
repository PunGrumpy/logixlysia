'use client'

import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Background } from './background'

const METHOD_PAD = 7

const httpMethod = {
  GET: {
    color: 'text-green-500'
  },
  POST: {
    color: 'text-blue-500'
  },
  PUT: {
    color: 'text-yellow-500'
  },
  PATCH: {
    color: 'text-purple-500'
  },
  DELETE: {
    color: 'text-red-500'
  },
  HEAD: {
    color: 'text-green-400'
  },
  OPTIONS: {
    color: 'text-cyan-500'
  }
} as const

const statusCodeClass = (status: number) => {
  if (status >= 500) {
    return 'text-red-500'
  }
  if (status >= 400) {
    return 'text-yellow-500'
  }
  if (status >= 300) {
    return 'text-cyan-500'
  }
  if (status >= 200) {
    return 'text-green-500'
  }
  return 'text-foreground'
}

type LogType = 'INFO' | 'WARNING' | 'ERROR'
type HttpMethod = keyof typeof httpMethod

export interface ContextLine {
  key: string
  value: string
}

export interface LogEntry {
  contextLines: ContextLine[]
  durationMs: number
  message: string
  method: HttpMethod
  pathname: string
  service: string
  status: number
  timestamp: string
  type: LogType
}

const SLOW_MS = 500
const VERY_SLOW_MS = 1000

const TIMESTAMP_PARTS = /\s+/

/** Show time column like the terminal: `HH:mm:ss.SSS`. */
const formatTimeColumn = (timestamp: string): string => {
  const parts = timestamp.trim().split(TIMESTAMP_PARTS)
  return parts.at(-1) ?? timestamp
}

const formatDurationMs = (ms: number): string => {
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

const durationClass = (ms: number) => {
  if (ms < SLOW_MS) {
    return 'font-semibold text-green-500'
  }
  if (ms < VERY_SLOW_MS) {
    return 'font-semibold text-yellow-500'
  }
  return 'font-bold text-red-500'
}

const foxChipClass = (type: LogType) =>
  cn(
    'inline-flex shrink-0 items-center justify-center rounded-sm px-1 py-0.5 text-[10px] leading-none sm:text-xs',
    type === 'INFO' && 'bg-green-600 text-black',
    type === 'WARNING' && 'bg-yellow-500 text-black',
    type === 'ERROR' && 'bg-red-600 text-black'
  )

const DEMO_SERVICE = 'api-server'

export const logs: LogEntry[] = [
  {
    timestamp: '2025-04-13 18:12:18.699',
    durationMs: 10,
    method: 'GET',
    pathname: '/',
    status: 200,
    type: 'INFO',
    service: DEMO_SERVICE,
    message: '',
    contextLines: []
  },
  {
    timestamp: '2025-04-13 18:12:19.120',
    durationMs: 0.14,
    method: 'GET',
    pathname: '/custom',
    status: 200,
    type: 'INFO',
    service: DEMO_SERVICE,
    message: 'Hello from custom logger',
    contextLines: [
      { key: 'feature', value: 'custom-route-log' },
      { key: 'userId', value: '123' }
    ]
  },
  {
    timestamp: '2025-04-13 18:12:20.045',
    durationMs: 0.12,
    method: 'GET',
    pathname: '/status/400',
    status: 400,
    type: 'WARNING',
    service: DEMO_SERVICE,
    message: '',
    contextLines: []
  },
  {
    timestamp: '2025-04-13 18:12:21.089',
    durationMs: 0.13,
    method: 'GET',
    pathname: '/status/404',
    status: 404,
    type: 'WARNING',
    service: DEMO_SERVICE,
    message: '',
    contextLines: []
  },
  {
    timestamp: '2025-04-13 18:12:22.301',
    durationMs: 0.45,
    method: 'GET',
    pathname: '/boom',
    status: 500,
    type: 'ERROR',
    service: DEMO_SERVICE,
    message: 'Boom!',
    contextLines: [
      { key: 'feature', value: 'custom-route-log' },
      { key: 'userId', value: '123' },
      { key: 'error', value: 'Boom!' }
    ]
  },
  {
    timestamp: '2025-04-13 18:12:23.100',
    durationMs: 12,
    method: 'POST',
    pathname: '/users',
    status: 201,
    type: 'INFO',
    service: DEMO_SERVICE,
    message: 'User signup',
    contextLines: [
      { key: 'email', value: 'ada@example.com' },
      { key: 'feature', value: 'signup-flow' }
    ]
  },
  {
    timestamp: '2025-04-13 18:12:30.225',
    durationMs: 1200,
    method: 'PATCH',
    pathname: '/items/123',
    status: 500,
    type: 'ERROR',
    service: DEMO_SERVICE,
    message: 'Payment failed',
    contextLines: [{ key: 'error', value: 'upstream timeout' }]
  }
]

const LOG_REPEAT_COUNT = 10

const METHODS = Object.keys(httpMethod) as HttpMethod[]
const PATHNAMES = [
  '/',
  '/items',
  '/items/123',
  '/users',
  '/users/42',
  '/auth/login',
  '/auth/logout',
  '/health',
  '/docs',
  '/custom',
  '/boom',
  '/status/400',
  '/status/404'
] as const

const STATUSES = [
  200, 201, 204, 301, 304, 400, 401, 403, 404, 409, 429, 500, 502, 503
] as const

const INFO_MESSAGES = [
  '',
  'Cache hit',
  'User signup',
  'Hello from custom logger',
  'Webhook accepted',
  'Session refreshed'
] as const

const ERROR_MESSAGES = [
  'Boom!',
  'Payment failed',
  'Upstream timeout',
  'Validation failed'
] as const

const createRng = (seed: number) => {
  const mod = 2_147_483_647
  const mul = 16_807
  let state = seed % mod
  if (state <= 0) {
    state += mod - 1
  }

  return () => {
    state = (state * mul) % mod
    return state / mod
  }
}

const getSeed = () => {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const buf = new Uint32Array(1)
    crypto.getRandomValues(buf)
    return Number(buf[0] ?? Date.now())
  }
  return Date.now()
}

const rngInt = (rng: () => number, min: number, max: number) => {
  const a = Math.ceil(min)
  const b = Math.floor(max)
  return Math.floor(rng() * (b - a + 1)) + a
}

const rngChoice = <T,>(rng: () => number, arr: readonly T[]) => {
  const idx = rngInt(rng, 0, Math.max(0, arr.length - 1))
  return arr[idx] as T
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const pad3 = (n: number) => String(n).padStart(3, '0')

const formatTimestamp = (d: Date) => {
  const yyyy = d.getFullYear()
  const mm = pad2(d.getMonth() + 1)
  const dd = pad2(d.getDate())
  const hh = pad2(d.getHours())
  const mi = pad2(d.getMinutes())
  const ss = pad2(d.getSeconds())
  const ms = pad3(d.getMilliseconds())
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}.${ms}`
}

const createRandomDurationMs = (rng: () => number) => {
  const bucket = rngInt(rng, 0, 4)
  if (bucket === 0) {
    return rng() * 0.99
  }
  if (bucket === 1) {
    return rngInt(rng, 1, 120)
  }
  if (bucket === 2) {
    return rngInt(rng, 120, 950)
  }
  if (bucket === 3) {
    return rngInt(rng, 950, 2500)
  }
  return rngInt(rng, 2500, 12_000)
}

const buildRandomContext = (
  rng: () => number,
  type: LogType,
  status: number
): ContextLine[] => {
  if (rng() < 0.32) {
    return []
  }

  const lines: ContextLine[] = []

  if (rng() > 0.45) {
    lines.push({
      key: 'requestId',
      value: `req_${rngInt(rng, 10_000, 99_999)}`
    })
  }

  if (type === 'ERROR' || status >= 500) {
    if (rng() > 0.25) {
      lines.push({ key: 'error', value: rngChoice(rng, ERROR_MESSAGES) })
    }
  } else if (rng() > 0.5) {
    lines.push({ key: 'userId', value: String(rngInt(rng, 1, 99_999)) })
  }

  if (lines.length === 0 && rng() > 0.4) {
    lines.push({ key: 'feature', value: 'demo-playground' })
  }

  return lines
}

const createRandomLog = (rng: () => number, now: number): LogEntry => {
  const method = rngChoice(rng, METHODS)
  const pathname = rngChoice(rng, PATHNAMES)
  const status = rngChoice(rng, STATUSES)

  let type: LogType = 'INFO'
  if (status >= 500) {
    type = 'ERROR'
  } else if (status >= 400) {
    type = 'WARNING'
  }

  const offsetMs = rngInt(rng, 0, 45_000)
  const timestamp = formatTimestamp(new Date(now - offsetMs))
  const durationMs = createRandomDurationMs(rng)

  const message =
    type === 'ERROR'
      ? rngChoice(rng, ERROR_MESSAGES)
      : rngChoice(rng, INFO_MESSAGES)

  return {
    timestamp,
    durationMs,
    method,
    pathname,
    status,
    type,
    service: DEMO_SERVICE,
    message,
    contextLines: buildRandomContext(rng, type, status)
  }
}

const createRepeatedRandomLogs = (seed: number) => {
  const rng = createRng(seed)
  const now = Date.now()

  return Array.from({ length: LOG_REPEAT_COUNT }, () =>
    Array.from({ length: logs.length }, () => createRandomLog(rng, now))
  )
}

const MainLine = ({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}) => (
  <div
    className={cn(
      'mx-3 flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 py-0.5 font-mono text-[11px] leading-snug sm:mx-8 sm:flex-nowrap sm:gap-x-2 sm:text-sm md:mx-16',
      className
    )}
  >
    {children}
  </div>
)

const ContextTree = ({ lines }: { lines: ContextLine[] }) => {
  if (lines.length === 0) {
    return null
  }

  const last = lines.length - 1

  return (
    <div className="mx-3 mb-0.5 space-y-0.5 sm:mx-8 md:mx-16">
      {lines.map((line, i) => {
        const branch = i === last ? '└─' : '├─'
        return (
          <div
            className="whitespace-pre-wrap font-mono text-[10px] leading-snug sm:text-xs"
            key={`${line.key}-${line.value}-${line.key}`}
          >
            <span className="text-muted-foreground/80">{`  ${branch} `}</span>
            <span className="text-cyan-400">{line.key}</span>
            <span className="text-muted-foreground/80">{'  '}</span>
            <span className="text-foreground">{line.value}</span>
          </div>
        )
      })}
    </div>
  )
}

const LogBlock = ({ log }: { log: LogEntry }) => {
  const durationLabel = formatDurationMs(log.durationMs)
  const showSlow = log.durationMs >= VERY_SLOW_MS
  const methodPadded = log.method.toUpperCase().padEnd(METHOD_PAD, ' ')
  const timeCol = formatTimeColumn(log.timestamp)

  return (
    <div>
      <MainLine>
        <span className="shrink-0 text-muted-foreground tabular-nums">
          {timeCol}
        </span>
        <span className="shrink-0 text-muted-foreground/80 tabular-nums">
          [{log.service}]{' '}
        </span>
        <span className={foxChipClass(log.type)} title={log.type}>
          {' 🦊 '}
        </span>
        <span
          className={cn(
            'shrink-0 font-semibold tabular-nums',
            httpMethod[log.method].color
          )}
        >
          {methodPadded}
        </span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground sm:max-w-[min(40vw,14rem)] sm:flex-none sm:truncate sm:break-all md:max-w-[min(48vw,20rem)]">
          {log.pathname}
        </span>
        <span
          className={cn(
            'shrink-0 font-semibold tabular-nums',
            statusCodeClass(log.status)
          )}
        >
          {log.status}
        </span>
        <span
          className={cn(
            'shrink-0 font-mono tabular-nums',
            durationClass(log.durationMs)
          )}
        >
          {durationLabel}
        </span>
        {log.message ? (
          <span className="min-w-0 truncate text-foreground/90">
            {log.message}
          </span>
        ) : null}
        {showSlow ? (
          <span className="shrink-0 font-mono text-yellow-500">⚡ slow</span>
        ) : null}
      </MainLine>
      <ContextTree lines={log.contextLines} />
    </div>
  )
}

const TerminalCursor = () => (
  <div aria-hidden className="mx-3 mt-2 flex items-center sm:mx-8 md:mx-16">
    <span className="inline-block h-[1.1em] w-[0.5em] animate-cursor-blink bg-foreground" />
  </div>
)

const Output = () => {
  const [seed, setSeed] = useState<number | null>(null)

  useEffect(() => {
    setSeed(getSeed())
  }, [])

  const repeatedLogs = useMemo(() => {
    if (seed === null) {
      return Array.from({ length: LOG_REPEAT_COUNT }, (_, listIndex) =>
        logs.map((log, logIndex) => ({
          ...log,
          renderId: `static-${listIndex}-${logIndex}-${log.timestamp}`
        }))
      )
    }
    return createRepeatedRandomLogs(seed).map((logList, listIndex) =>
      logList.map((log, logIndex) => ({
        ...log,
        renderId: `seed-${seed}-${listIndex}-${logIndex}-${log.timestamp}`
      }))
    )
  }, [seed])

  return (
    <code className="flex animate-marquee-vertical flex-col will-change-transform">
      <div className="flex flex-col">
        {repeatedLogs.flatMap(logList =>
          logList.map(log => <LogBlock key={log.renderId} log={log} />)
        )}
      </div>
    </code>
  )
}

export const Playground = () => (
  <section className="relative flex w-full flex-col items-center justify-center overflow-hidden rounded-xl sm:rounded-2xl md:rounded-3xl">
    <Background />

    <div className="size-full px-3 pt-6 pb-3 sm:px-12 sm:pt-12 sm:pb-6 md:px-16">
      <div
        className={cn(
          'overflow-hidden rounded-lg bg-background/60 shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset] backdrop-blur-md',
          'sm:rounded-xl'
        )}
      >
        <div className="flex items-center gap-2 border border-b bg-background/40 px-3 py-2 sm:px-4">
          <span aria-hidden className="size-2.5 rounded-full bg-red-500/90" />
          <span
            aria-hidden
            className="size-2.5 rounded-full bg-yellow-500/90"
          />
          <span aria-hidden className="size-2.5 rounded-full bg-green-500/90" />
          <span className="ml-2 font-mono text-[10px] text-muted-foreground sm:text-xs">
            logixlysia — request logs
          </span>
        </div>
        <article
          className={cn(
            'max-h-128 overflow-x-auto overflow-y-hidden p-3 sm:p-6',
            'hide-scrollbar'
          )}
        >
          <pre className="select-none whitespace-normal font-mono text-xs sm:text-sm">
            <Output />
          </pre>
          <TerminalCursor />
        </article>
      </div>
    </div>
  </section>
)
