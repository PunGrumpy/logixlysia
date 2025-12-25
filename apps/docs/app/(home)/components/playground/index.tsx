'use client'

import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Background } from './background'

const logLevel = {
  INFO: {
    color: 'text-muted bg-green-600'
  },
  WARNING: {
    color: 'text-muted bg-yellow-600'
  },
  ERROR: {
    color: 'text-muted bg-red-600'
  }
}

const httpMethod = {
  GET: {
    color: 'text-green-500'
  },
  POST: {
    color: 'text-yellow-500'
  },
  PUT: {
    color: 'text-blue-500'
  },
  PATCH: {
    color: 'text-purple-500'
  },
  DELETE: {
    color: 'text-red-500'
  },
  HEAD: {
    color: 'text-cyan-500'
  },
  OPTIONS: {
    color: 'text-purple-500'
  }
}

const statusCode = (status: number) => {
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
  return 'text-white'
}

type LogType = keyof typeof logLevel
type HttpMethod = keyof typeof httpMethod

export interface LogEntry {
  icon: string
  timestamp: string
  duration: string
  method: HttpMethod
  pathname: string
  status: number
  type: LogType
}

export const logs: LogEntry[] = [
  {
    icon: '🦊',
    timestamp: '2025-04-13 15:00:19.225',
    duration: '1ms',
    method: 'GET',
    pathname: '/',
    status: 200,
    type: 'INFO'
  },
  {
    icon: '🦊',
    timestamp: '2025-04-13 15:00:21.245',
    duration: '509μs',
    method: 'POST',
    pathname: '/items',
    status: 201,
    type: 'INFO'
  },
  {
    icon: '🦊',
    timestamp: '2025-04-13 15:00:22.225',
    duration: '900ns',
    method: 'PUT',
    pathname: '/items/123',
    status: 200,
    type: 'INFO'
  },
  {
    icon: '🦊',
    timestamp: '2025-04-13 15:00:23.30',
    duration: '1ms',
    method: 'DELETE',
    pathname: '/items/123',
    status: 200,
    type: 'INFO'
  },
  {
    icon: '🦊',
    timestamp: '2025-04-13 15:00:30.225',
    duration: '10s',
    method: 'PATCH',
    pathname: '/items/123',
    status: 500,
    type: 'ERROR'
  },
  {
    icon: '🦊',
    timestamp: '2025-04-13 15:00:31.225',
    duration: '1ms',
    method: 'HEAD',
    pathname: '/items/123',
    status: 200,
    type: 'INFO'
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
  '/docs'
] as const

const STATUSES = [
  200, 201, 204, 301, 304, 400, 401, 403, 404, 409, 429, 500, 502, 503
] as const

// Deterministic, seeded PRNG (no bitwise — matches repo lint rules).
// Park–Miller LCG: https://en.wikipedia.org/wiki/Lehmer_random_number_generator
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

const createRandomDuration = (rng: () => number) => {
  const bucket = rngInt(rng, 0, 3)
  if (bucket === 0) {
    return `${rngInt(rng, 50, 950)}ns`
  }
  if (bucket === 1) {
    return `${rngInt(rng, 1, 999)}μs`
  }
  if (bucket === 2) {
    return `${rngInt(rng, 1, 120)}ms`
  }
  return `${rngInt(rng, 1, 12)}s`
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

  return {
    icon: '🦊',
    timestamp,
    duration: createRandomDuration(rng),
    method,
    pathname,
    status,
    type
  }
}

const createRepeatedRandomLogs = (seed: number) => {
  const rng = createRng(seed)
  const now = Date.now()

  return Array.from({ length: LOG_REPEAT_COUNT }, () =>
    Array.from({ length: logs.length }, () => createRandomLog(rng, now))
  )
}

const Line = ({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}) => (
  <div
    className={cn(
      'mx-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 py-0.5 text-[11px] leading-4 sm:mx-8 sm:flex-nowrap sm:gap-2 sm:text-sm md:mx-16',
      className
    )}
  >
    {children}
  </div>
)

const Dim = ({ children }: { children: React.ReactNode }) => (
  <span className="text-muted-foreground/50">{children}</span>
)

const Timestamp = ({ value }: { value: string }) => (
  <>
    <span className="bg-yellow-500 px-1.5 text-muted sm:hidden">
      {value.split(' ')[1] ?? value}
    </span>
    <span className="hidden bg-yellow-500 px-2 text-muted sm:inline">
      {value}
    </span>
  </>
)

const Level = ({ value }: { value: LogType }) => (
  <span className={cn('px-2', logLevel[value].color)}>{value}</span>
)

const Method = ({ value }: { value: HttpMethod }) => (
  <span className={cn('font-semibold', httpMethod[value].color)}>{value}</span>
)

const Status = ({ value }: { value: number }) => (
  <span className={cn('font-semibold tabular-nums', statusCode(value))}>
    {value}
  </span>
)

const Output = () => {
  // Keep SSR/initial hydration stable; randomize only after mount.
  const [seed, setSeed] = useState<number | null>(null)

  useEffect(() => {
    setSeed(getSeed())
  }, [])

  const repeatedLogs = useMemo(() => {
    if (seed === null) {
      return Array.from({ length: LOG_REPEAT_COUNT }, () => logs)
    }
    return createRepeatedRandomLogs(seed)
  }, [seed])

  return (
    <code className="flex animate-marquee-vertical flex-col will-change-transform">
      <div className="flex flex-col">
        {repeatedLogs.flatMap((logList, repeatIndex) =>
          logList.map((log, logIndex) => (
            <Line
              key={`${repeatIndex}-${logIndex}-${log.method}-${log.pathname}-${log.status}-${log.type}-${log.timestamp}`}
            >
              <span>{log.icon}</span>
              <Timestamp value={log.timestamp} />
              <Level value={log.type} />
              <span className="hidden px-4 md:inline">
                <Dim>{log.duration}</Dim>
              </span>
              <Method value={log.method} />
              <span className="min-w-0 flex-1 truncate text-muted-foreground sm:flex-none sm:truncate sm:break-all">
                {log.pathname}
              </span>
              <Status value={log.status} />
            </Line>
          ))
        )}
      </div>
    </code>
  )
}

export const Playground = () => (
  <section className="relative flex w-full flex-col items-center justify-center overflow-hidden rounded-xl sm:rounded-2xl md:rounded-3xl">
    <Background />

    <div className="size-full sm:px-16 sm:pt-16">
      <article
        className={cn(
          'max-h-128 overflow-x-auto overflow-y-hidden rounded-x-xl rounded-t-xl p-8 sm:rounded-x-2xl sm:rounded-t-2xl',
          'hide-scrollbar bg-black/80 backdrop-blur-sm'
        )}
      >
        <pre className="select-none whitespace-normal font-mono text-xs sm:text-sm">
          <Output />
        </pre>
      </article>
    </div>
  </section>
)
