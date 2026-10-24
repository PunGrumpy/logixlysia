import { describe, expect, test } from 'bun:test'
import { createKeyedMutex } from '../../src/output/keyed-mutex'
import { sleep } from '../_helpers/sleep'

describe('createKeyedMutex', () => {
  test('same-tick acquires for the same key are never held concurrently', async () => {
    const mutex = createKeyedMutex()
    let holders = 0
    let maxHolders = 0

    const run = async (): Promise<void> => {
      const release = await mutex.acquire('key')
      holders += 1
      maxHolders = Math.max(maxHolders, holders)
      await sleep(5)
      holders -= 1
      release()
    }

    await Promise.all([run(), run(), run()])

    expect(maxHolders).toBe(1)
  })

  test('acquisitions for different keys never block each other', async () => {
    const mutex = createKeyedMutex()

    const releaseA = await mutex.acquire('a')
    const releaseB = await mutex.acquire('b')

    releaseA()
    releaseB()
  })

  test('release only clears the map entry when the caller is the current tail', async () => {
    const mutex = createKeyedMutex()
    const events: string[] = []

    const releaseA = await mutex.acquire('key')

    const bAcquirePromise = mutex.acquire('key').then(release => {
      events.push('B-start')
      return release
    })

    releaseA()
    const releaseB = await bAcquirePromise

    let cStarted = false
    const cAcquirePromise = mutex.acquire('key').then(release => {
      cStarted = true
      events.push('C-start')
      return release
    })

    await sleep(5)
    expect(cStarted).toBe(false)

    releaseB()
    const releaseC = await cAcquirePromise
    expect(cStarted).toBe(true)
    releaseC()

    expect(events).toEqual(['B-start', 'C-start'])
  })
})
