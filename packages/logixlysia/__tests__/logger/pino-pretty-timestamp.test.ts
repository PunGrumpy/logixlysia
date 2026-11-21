import { describe, expect, test } from 'bun:test'
import path from 'node:path'
import { spawnSync } from 'bun'
import { CHILD_PROCESS_TIMEOUT_MS } from '../_helpers/child-process'

const packageRoot = path.join(import.meta.dir, '..', '..')
const loggerEntry = path.join(packageRoot, 'src', 'logger', 'index.ts')

const INSTANT = Date.UTC(2026, 0, 2, 3, 4, 5, 678)
const ZONE = 'Asia/Bangkok'
const PRETTY_PRINT_WINS = 'translateTime inside pino.prettyPrint'

interface Case {
  prettyPrint?: Record<string, unknown>
  translateTime: string
}

interface Observed {
  hour: number
  times: Record<string, string>
}

const PATTERNS = [
  'HH:MM:ss.SSS',
  'yyyy-mm-dd HH:MM:ss',
  'yyyy-mm-ddTHH:MM:ss',
  'dd/mm/yyyy at HH:MM',
  'mmmm/dddd',
  'HHHH',
  'UTC:yyyy-mm-dd HH:MM:ss.SSS',
  'SYS:HH:MM:ss.SSS',
  'SYS:standard',
  'SYS:STANDARD',
  'sys:Standard',
  'UTC:standard',
  'UTC:STANDARD',
  'SYS:',
  'UTC:'
]

const cases: Record<string, Case> = {
  [PRETTY_PRINT_WINS]: {
    prettyPrint: { translateTime: 'UTC:HH:MM:ss.l' },
    translateTime: 'yyyy'
  }
}
for (const pattern of PATTERNS) {
  cases[pattern] = { translateTime: pattern }
}

// The zone is set in the child's environment, so this process keeps its own
// zone and its own module cache.
const script = `
import { Writable } from 'node:stream'
const { createLogger } = await import(process.env.ENTRY)
const instant = Number(process.env.INSTANT)
const times = {}
for (const [name, { prettyPrint, translateTime }] of Object.entries(
  JSON.parse(process.env.CASES)
)) {
  let text = ''
  const destination = new Writable({
    write(chunk, _encoding, done) {
      text += chunk.toString()
      done()
    }
  })
  const logger = createLogger({
    config: {
      disableFileLogging: true,
      disableInternalLogger: true,
      pino: {
        prettyPrint: { colorize: false, destination, sync: true, ...prettyPrint },
        timestamp: () => ',"time":' + instant
      },
      timestamp: { translateTime }
    }
  })
  logger.pino.info('hi')
  times[name] =
    /^\\[([^\\]]*)\\]/u.exec(text)?.[1] ?? 'no bracketed time in ' + JSON.stringify(text)
}
console.log(JSON.stringify({ hour: new Date(instant).getHours(), times }))
`

let observed: Observed | undefined

const observe = (): Observed => {
  if (observed === undefined) {
    const proc = spawnSync(['bun', '-e', script], {
      cwd: packageRoot,
      env: {
        ...process.env,
        CASES: JSON.stringify(cases),
        ENTRY: loggerEntry,
        INSTANT: String(INSTANT),
        TZ: ZONE
      }
    })
    if (proc.exitCode !== 0) {
      throw new Error(`bun child failed: ${proc.stderr}`)
    }
    observed = JSON.parse(
      proc.stdout.toString().trim().split('\n').at(-1) ?? ''
    )
  }
  return observed as Observed
}

const prettyTime = (pattern: string): string | undefined =>
  observe().times[pattern]

describe('timestamp.translateTime on pretty pino lines', () => {
  test(
    'the zone switch took effect',
    () => {
      expect(observe().hour).toBe(10)
    },
    CHILD_PROCESS_TIMEOUT_MS
  )

  test(
    'a bare pattern is local time with milliseconds',
    () => {
      expect(prettyTime('HH:MM:ss.SSS')).toBe('10:04:05.678')
    },
    CHILD_PROCESS_TIMEOUT_MS
  )

  test(
    'a bare date pattern is local time',
    () => {
      expect(prettyTime('yyyy-mm-dd HH:MM:ss')).toBe('2026-01-02 10:04:05')
    },
    CHILD_PROCESS_TIMEOUT_MS
  )

  test(
    'letters between tokens are printed as written',
    () => {
      expect(prettyTime('yyyy-mm-ddTHH:MM:ss')).toBe('2026-01-02T10:04:05')
    },
    CHILD_PROCESS_TIMEOUT_MS
  )

  test(
    'a word between tokens is printed as written',
    () => {
      expect(prettyTime('dd/mm/yyyy at HH:MM')).toBe('02/01/2026 at 10:04')
    },
    CHILD_PROCESS_TIMEOUT_MS
  )

  test(
    'month and day tokens side by side stay two tokens',
    () => {
      expect(prettyTime('mmmm/dddd')).toBe('0101/0202')
    },
    CHILD_PROCESS_TIMEOUT_MS
  )

  test(
    'hour tokens side by side stay two tokens',
    () => {
      expect(prettyTime('HHHH')).toBe('1010')
    },
    CHILD_PROCESS_TIMEOUT_MS
  )

  test(
    'a UTC pattern is UTC with milliseconds',
    () => {
      expect(prettyTime('UTC:yyyy-mm-dd HH:MM:ss.SSS')).toBe(
        '2026-01-02 03:04:05.678'
      )
    },
    CHILD_PROCESS_TIMEOUT_MS
  )

  test(
    'a SYS pattern is local time',
    () => {
      expect(prettyTime('SYS:HH:MM:ss.SSS')).toBe('10:04:05.678')
    },
    CHILD_PROCESS_TIMEOUT_MS
  )

  test(
    "SYS:standard keeps pino-pretty's standard form",
    () => {
      expect(prettyTime('SYS:standard')).toBe('2026-01-02 10:04:05.678 +0700')
    },
    CHILD_PROCESS_TIMEOUT_MS
  )

  test(
    'SYS:STANDARD is the standard form',
    () => {
      expect(prettyTime('SYS:STANDARD')).toBe('2026-01-02 10:04:05.678 +0700')
    },
    CHILD_PROCESS_TIMEOUT_MS
  )

  test(
    'sys:Standard is the standard form',
    () => {
      expect(prettyTime('sys:Standard')).toBe('2026-01-02 10:04:05.678 +0700')
    },
    CHILD_PROCESS_TIMEOUT_MS
  )

  test(
    'UTC:STANDARD is the standard form in UTC',
    () => {
      expect(prettyTime('UTC:STANDARD')).toBe('2026-01-02 03:04:05.678 +0000')
    },
    CHILD_PROCESS_TIMEOUT_MS
  )

  test(
    'UTC:standard is the standard form in UTC',
    () => {
      expect(prettyTime('UTC:standard')).toBe('2026-01-02 03:04:05.678 +0000')
    },
    CHILD_PROCESS_TIMEOUT_MS
  )

  test(
    'SYS: with no pattern prints nothing',
    () => {
      expect(prettyTime('SYS:')).toBe('')
    },
    CHILD_PROCESS_TIMEOUT_MS
  )

  test(
    'UTC: with no pattern prints nothing',
    () => {
      expect(prettyTime('UTC:')).toBe('')
    },
    CHILD_PROCESS_TIMEOUT_MS
  )

  test(
    'a translateTime inside pino.prettyPrint wins and is not rewritten',
    () => {
      expect(prettyTime(PRETTY_PRINT_WINS)).toBe('03:04:05.678')
    },
    CHILD_PROCESS_TIMEOUT_MS
  )
})
