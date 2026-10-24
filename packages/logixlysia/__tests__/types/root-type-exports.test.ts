import { expect, test } from 'bun:test'
import type {
  LogFilter,
  LogixlysiaConfig,
  LogRotationConfig,
  SinkErrorContext,
  WebSocketLike
} from '../../src'

test('the documented types are importable from the package root', () => {
  const filter: LogFilter = { level: ['ERROR'] }
  const rotation: LogRotationConfig = { maxSize: '10m' }
  const config: LogixlysiaConfig = { logRotation: rotation }
  const sink: SinkErrorContext['sink'] = 'file'
  const socket: Partial<WebSocketLike> = {}
  expect([filter, config, sink, socket]).toHaveLength(4)
})
