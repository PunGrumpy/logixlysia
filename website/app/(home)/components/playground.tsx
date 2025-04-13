'use client'
import { cn } from '@/lib/utils'
import { MarqueeProvider } from '@/providers/marquee'

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
    duration: '379μs',
    method: 'GET',
    pathname: '/',
    status: 200,
    type: 'INFO'
  },
  {
    icon: '🦊',
    timestamp: '2025-04-13 15:00:20.225',
    duration: '1ms',
    method: 'POST',
    pathname: '/items',
    status: 201,
    type: 'INFO'
  },
  {
    icon: '🦊',
    timestamp: '2025-04-13 15:00:20.235',
    duration: '379μs',
    method: 'GET',
    pathname: '/success/123',
    status: 200,
    type: 'INFO'
  },
  {
    icon: '🦊',
    timestamp: '2025-04-13 15:00:21.245',
    duration: '379μs',
    method: 'POST',
    pathname: '/items',
    status: 201,
    type: 'INFO'
  },
  {
    icon: '🦊',
    timestamp: '2025-04-13 15:00:22.225',
    duration: '379μs',
    method: 'PUT',
    pathname: '/items/123',
    status: 200,
    type: 'INFO'
  },
  {
    icon: '🦊',
    timestamp: '2025-04-13 15:00:23.30',
    duration: '379μs',
    method: 'DELETE',
    pathname: '/items/123',
    status: 200,
    type: 'INFO'
  },
  {
    icon: '🦊',
    timestamp: '2025-04-13 15:00:30.225',
    duration: '379μs',
    method: 'PATCH',
    pathname: '/items/123',
    status: 200,
    type: 'INFO'
  },
  {
    icon: '🦊',
    timestamp: '2025-04-13 15:01:30.225',
    duration: '379μs',
    method: 'GET',
    pathname: '/error',
    status: 500,
    type: 'ERROR'
  }
]

const MarqueeItem = ({
  icon,
  timestamp,
  duration,
  method,
  pathname,
  status,
  type
}: (typeof logs)[number]) => (
  <div
    className="group mx-8 block font-mono text-sm sm:mx-16"
    key={`${method}-${pathname}-${timestamp}`}
    aria-label={`Log entry for ${method} ${pathname} at ${timestamp}`}
  >
    <div className="flex space-x-2">
      <span>{icon}</span>
      <span className="bg-yellow-500 px-2 text-muted">{timestamp}</span>
      <span
        className={cn('px-2', logLevel[type as keyof typeof logLevel].color)}
      >
        {type}
      </span>
      <span className="px-4 text-muted-foreground/50">{duration}</span>
      <span className={httpMethod[method as keyof typeof httpMethod].color}>
        {method}
      </span>
      <span className="text-muted-foreground">{pathname}</span>
      <span className={statusCode(status)}>{status}</span>
    </div>
  </div>
)

export const Playground = () => {
  const paddedLogs = [...logs, ...logs, ...logs]

  return (
    <section
      id="playground"
      className="grid gap-8 overflow-hidden py-16 text-center"
    >
      <p className="font-medium text-muted-foreground text-sm">
        Plug and log your Elysia.js app with Logixlysia
      </p>
      <div className="sm:-my-8 grid w-full gap-8 overflow-hidden sm:h-72 sm:py-8 [&>div]:flex">
        <MarqueeProvider
          direction="up"
          speed={15}
          loop={0}
          autoFill
          className="!overflow-visible flex items-center"
        >
          <div className="flex flex-col space-y-1 py-4">
            {paddedLogs.map((log, index) => (
              <MarqueeItem
                key={`${log.method}-${log.pathname}-${log.timestamp}-${index}`}
                {...log}
              />
            ))}
          </div>
        </MarqueeProvider>
      </div>
    </section>
  )
}
