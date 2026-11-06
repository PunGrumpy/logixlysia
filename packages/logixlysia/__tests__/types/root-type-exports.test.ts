import { expect, test } from 'bun:test'
import type {
  FormattingConfig,
  LogFilter,
  LogixlysiaConfig,
  LogRotationConfig,
  OutputConfig,
  PinoConfig,
  PrettyPrintConfig,
  RedactionConfig,
  RequestTrackingConfig,
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

test('every config sub-type is importable from the package root', () => {
  const formatting: FormattingConfig = { slowThreshold: 500 }
  const output: OutputConfig = { disableFileLogging: true }
  const pretty: PrettyPrintConfig = true
  const pino: PinoConfig = { pino: { prettyPrint: pretty } }
  const redaction: RedactionConfig = { redactKeys: ['password'] }
  const tracking: RequestTrackingConfig = {}
  const config: LogixlysiaConfig = {
    ...formatting,
    ...output,
    ...pino,
    ...redaction,
    ...tracking
  }
  expect(Object.keys(config)).toEqual([
    'slowThreshold',
    'disableFileLogging',
    'pino',
    'redactKeys'
  ])
})
