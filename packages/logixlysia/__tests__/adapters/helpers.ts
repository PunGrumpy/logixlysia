import { mock } from 'bun:test'

export interface FetchCall {
  body: string
  headers: Record<string, string>
  method: string
  url: string
}

export interface FetchStub {
  calls: FetchCall[]
  restore: () => void
}

/**
 * Replaces `globalThis.fetch` with a stub that records calls and answers with
 * the queued responses (the last one repeats). Call `restore()` in `finally`.
 */
export const stubFetch = (
  responses: Array<{ body?: string; status: number }> = [{ status: 200 }]
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
      url: String(input)
    })
    const response = responses[Math.min(index, responses.length - 1)]
    index += 1
    return Promise.resolve(
      new Response(response?.body ?? '{}', { status: response?.status ?? 200 })
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

/** Sets env vars for a test, returning a restore function. */
export const stubEnv = (
  vars: Record<string, string | undefined>
): (() => void) => {
  const previous = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(vars)) {
    previous.set(key, process.env[key])
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
  return () => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}
