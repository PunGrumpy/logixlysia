import { mock } from 'bun:test'
import { sleep } from '../_helpers/sleep'

export interface FetchCall {
  body: string
  headers: Record<string, string>
  method: string
  redirect: string
  url: string
}

export interface FetchStub {
  calls: FetchCall[]
  restore: () => void
}

export type StubResponse =
  | { body?: string; headers?: Record<string, string>; status: number }
  | { reject: unknown }

export const stubFetch = (
  responses: StubResponse[] = [{ status: 200 }]
): FetchStub => {
  const original = globalThis.fetch
  const calls: FetchCall[] = []
  let index = 0

  const fake = mock((input: string | URL | Request, init?: RequestInit) => {
    const headers: Record<string, string> = {}
    for (const [key, value] of new Headers(init?.headers).entries()) {
      headers[key] = value
    }
    calls.push({
      body: typeof init?.body === 'string' ? init.body : '',
      headers,
      method: init?.method ?? 'GET',
      redirect: init?.redirect ?? 'follow',
      url: String(input)
    })
    const response = responses[Math.min(index, responses.length - 1)]
    index += 1
    if (response && 'reject' in response) {
      return Promise.reject(response.reject)
    }
    return Promise.resolve(
      new Response(response?.body ?? '{}', {
        headers: response?.headers,
        status: response?.status ?? 200
      })
    )
  })

  globalThis.fetch = fake as unknown as typeof fetch

  return {
    calls,
    restore: () => {
      globalThis.fetch = original
    }
  }
}

export const stubEnv = (
  vars: Record<string, string | undefined>
): (() => void) => {
  const previous = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(vars)) {
    previous.set(key, process.env[key])
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key)
    } else {
      process.env[key] = value
    }
  }
  return () => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        Reflect.deleteProperty(process.env, key)
      } else {
        process.env[key] = value
      }
    }
  }
}

export interface WatchedTimer {
  /** Set once the code under test clears the timer. */
  cleared: boolean
  /** Runs the timer's callback now, as if its delay had passed. */
  fire: () => void
  timer: ReturnType<typeof setTimeout>
}

/**
 * Records every timer set for `delayMs`, so a test can read whether it holds
 * the process or was cleared, and fire it without waiting.
 */
export const watchTimers = (
  delayMs: number
): { restore: () => void; timers: WatchedTimer[] } => {
  const originalSet = globalThis.setTimeout
  const originalClear = globalThis.clearTimeout
  const timers: WatchedTimer[] = []
  const watchedSet = (
    handler: () => void,
    ms?: number
  ): ReturnType<typeof setTimeout> => {
    const timer = originalSet(handler, ms)
    if (ms === delayMs) {
      timers.push({
        cleared: false,
        fire: () => {
          originalClear(timer)
          handler()
        },
        timer
      })
    }
    return timer
  }
  const watchedClear = (timer?: ReturnType<typeof setTimeout>): void => {
    const watched = timers.find(item => item.timer === timer)
    if (watched) {
      watched.cleared = true
    }
    originalClear(timer)
  }
  globalThis.setTimeout = watchedSet as unknown as typeof setTimeout
  globalThis.clearTimeout = watchedClear as unknown as typeof clearTimeout
  return {
    restore: () => {
      globalThis.setTimeout = originalSet
      globalThis.clearTimeout = originalClear
    },
    timers
  }
}

export interface HeldRequest {
  body: string
  respond: (response: Response) => void
  signal: AbortSignal
}

/**
 * A fetch whose requests stay open until the test answers them. Aborting a
 * request's signal rejects it, as it does a real one.
 */
export const holdFetch = (): {
  requests: HeldRequest[]
  restore: () => void
} => {
  const original = globalThis.fetch
  const requests: HeldRequest[] = []
  const held = (
    _url: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const { promise, reject, resolve }: PromiseWithResolvers<Response> =
      Promise.withResolvers()
    const signal = init?.signal ?? new AbortController().signal
    signal.addEventListener('abort', () => reject(signal.reason), {
      once: true
    })
    requests.push({
      body: typeof init?.body === 'string' ? init.body : '',
      respond: resolve,
      signal
    })
    return promise
  }
  globalThis.fetch = held as unknown as typeof fetch
  return {
    requests,
    restore: () => {
      globalThis.fetch = original
    }
  }
}

const PENDING = Symbol('pending')

/** Whether `promise` resolves or rejects within `ms`. */
export const settlesWithin = async (
  promise: Promise<unknown>,
  ms: number
): Promise<boolean> => {
  const outcome = await Promise.race([
    promise.then(
      () => 'settled' as const,
      () => 'settled' as const
    ),
    sleep(ms).then(() => PENDING)
  ])
  return outcome !== PENDING
}
