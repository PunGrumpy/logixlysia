import { describe, expect, test } from 'bun:test'
import path from 'node:path'

const srcEntry = path.resolve(import.meta.dir, '../../src/index.ts')

const runApp = async (options: {
  nodeEnv: string
  useAsyncLocalStorage?: boolean
  withPlugin?: boolean
}): Promise<string> => {
  const script = `
    import { Elysia } from 'elysia'
    import { logixlysia, useLogger } from ${JSON.stringify(srcEntry)}
    const app = new Elysia()
    if (${options.withPlugin ?? true}) {
      app.use(logixlysia({ config: {
        disableFileLogging: true,
        disableInternalLogger: true,
        useAsyncLocalStorage: ${options.useAsyncLocalStorage ?? false}
      } }))
    }
    app.get('/', () => {
      useLogger().info('one')
      useLogger().info('two')
      return 'ok'
    })
    await app.handle(new Request('http://localhost/'))
    await app.handle(new Request('http://localhost/'))
    useLogger().info('outside a request')
  `
  const proc = Bun.spawn([process.execPath, '-e', script], {
    env: { ...process.env, NODE_ENV: options.nodeEnv },
    stderr: 'pipe',
    stdout: 'pipe'
  })
  const stderr = await new Response(proc.stderr).text()
  await proc.exited
  return stderr
}

const countWarnings = (stderr: string): number =>
  stderr.split('\n').filter(line => line.includes('useAsyncLocalStorage'))
    .length

describe('useLogger() fallback warning', () => {
  test('warns once, naming the option, when the fallback loses request context', async () => {
    const stderr = await runApp({ nodeEnv: 'development' })

    expect(countWarnings(stderr)).toBe(1)
    expect(stderr).toContain('[logixlysia]')
    expect(stderr).toContain('useAsyncLocalStorage: true')
  })

  test('stays silent when useAsyncLocalStorage is on', async () => {
    const stderr = await runApp({
      nodeEnv: 'development',
      useAsyncLocalStorage: true
    })

    expect(countWarnings(stderr)).toBe(0)
  })

  test('stays silent in production', async () => {
    const stderr = await runApp({ nodeEnv: 'production' })

    expect(countWarnings(stderr)).toBe(0)
  })

  test('stays silent when no plugin was created', async () => {
    const stderr = await runApp({ nodeEnv: 'development', withPlugin: false })

    expect(countWarnings(stderr)).toBe(0)
  })
})
