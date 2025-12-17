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

export const logs = [
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

const Output = () => (
  <code className="flex animate-marquee-vertical flex-col will-change-transform">
    <div className="flex flex-col">
      {Array.from(
        { length: LOG_REPEAT_COUNT },
        (_, repeatIndex) => repeatIndex
      ).flatMap(repeatIndex =>
        logs.map((log, logIndex) => (
          <div
            className="mx-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 py-0.5 text-[11px] leading-4 sm:mx-8 sm:flex-nowrap sm:gap-2 sm:text-sm md:mx-16"
            key={`${repeatIndex}-${logIndex}-${log.method}-${log.pathname}-${log.status}-${log.type}`}
          >
            <span>{log.icon}</span>
            <span className="bg-yellow-500 px-1.5 text-muted sm:hidden">
              {log.timestamp.split(' ')[1] ?? log.timestamp}
            </span>
            <span className="hidden bg-yellow-500 px-2 text-muted sm:inline">
              {log.timestamp}
            </span>
            <span
              className={cn(
                'px-2',
                logLevel[log.type as keyof typeof logLevel].color
              )}
            >
              {log.type}
            </span>
            <span className="hidden px-4 text-muted-foreground/50 md:inline">
              {log.duration}
            </span>
            <span
              className={cn(
                'font-semibold',
                httpMethod[log.method as keyof typeof httpMethod].color
              )}
            >
              {log.method}
            </span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground sm:flex-none sm:truncate sm:break-all">
              {log.pathname}
            </span>
            <span
              className={cn(
                'font-semibold tabular-nums',
                statusCode(log.status)
              )}
            >
              {log.status}
            </span>
          </div>
        ))
      )}
    </div>
  </code>
)

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
