import { describe, expect, test } from 'bun:test'
import { createKeyedMutex } from '../../src/output/keyed-mutex'

describe('createKeyedMutex', () => {
  test('same-tick acquires for the same key are never held concurrently', async () => {
    const mutex = createKeyedMutex()
    let holders = 0
    let maxHolders = 0

    const run = async (): Promise<void> => {
      const release = await mutex.acquire('key')
      holders += 1
      maxHolders = Math.max(maxHolders, holders)
      // Hold the lock across a macrotask window: any concurrent holder would
      // overlap here and push `holders` above 1.
      await new Promise(resolve => setTimeout(resolve, 5))
      holders -= 1
      release()
    }

    // Fire all three acquires in the same tick (no awaits between calls) so
    // any implementation that registers its lock *after* awaiting the prior
    // one would let same-tick callers all read the same (stale) prior lock.
    await Promise.all([run(), run(), run()])

    expect(maxHolders).toBe(1)
  })

  test('acquisitions for different keys never block each other', async () => {
    const mutex = createKeyedMutex()

    // Both resolve immediately (before either releases) because they key on
    // different strings; a shared/global lock would make the second await hang.
    const releaseA = await mutex.acquire('a')
    const releaseB = await mutex.acquire('b')

    releaseA()
    releaseB()
  })

  test('release only clears the map entry when the caller is the current tail', async () => {
    const mutex = createKeyedMutex()
    const events: string[] = []

    const releaseA = await mutex.acquire('key')

    // B registers itself as the map's "current" lock for `key` synchronously
    // inside acquire(), before it awaits A's lock.
    const bAcquirePromise = mutex.acquire('key').then(release => {
      events.push('B-start')
      return release
    })

    // A releases. Because B already overwrote the map entry, A's release
    // must NOT delete it — the map should still point at B's lock.
    releaseA()
    const releaseB = await bAcquirePromise

    // Queue C now. If A's release had incorrectly cleared the map, C would
    // read an empty map, treat `key` as free, and start immediately instead
    // of chaining onto B.
    let cStarted = false
    const cAcquirePromise = mutex.acquire('key').then(release => {
      cStarted = true
      events.push('C-start')
      return release
    })

    // Give any wrongly-unblocked C a window to (incorrectly) start.
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(cStarted).toBe(false)

    releaseB()
    const releaseC = await cAcquirePromise
    expect(cStarted).toBe(true)
    releaseC()

    expect(events).toEqual(['B-start', 'C-start'])
  })
})
