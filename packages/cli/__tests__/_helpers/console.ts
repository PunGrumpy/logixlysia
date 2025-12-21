import { mock } from 'bun:test'

type ConsoleMethod = 'log' | 'info' | 'warn' | 'error' | 'debug'

export const spyConsole = (
  methods: ConsoleMethod[] = ['log', 'info', 'warn', 'error', 'debug']
): {
  spies: Record<ConsoleMethod, ReturnType<typeof mock>>
  restore: () => void
} => {
  const originals = new Map<ConsoleMethod, typeof console.log>()
  const spies = {
    log: mock(() => {
      /* noop */
    }),
    info: mock(() => {
      /* noop */
    }),
    warn: mock(() => {
      /* noop */
    }),
    error: mock(() => {
      /* noop */
    }),
    debug: mock(() => {
      /* noop */
    })
  } as const

  for (const method of methods) {
    originals.set(method, console[method])
    console[method] = spies[method] as unknown as typeof console.log
  }

  const restore = () => {
    for (const method of methods) {
      const original = originals.get(method)
      if (original) {
        console[method] = original
      }
    }
  }

  return { spies: { ...spies }, restore }
}
