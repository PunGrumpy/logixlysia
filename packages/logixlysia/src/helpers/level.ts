import type { LogLevel } from '../types/core'

/** Every level, quietest first. A level's rank is its index. */
export const LOG_LEVELS: readonly LogLevel[] = [
  'DEBUG',
  'INFO',
  'WARNING',
  'ERROR'
]

export const levelRank = (level: LogLevel): number => LOG_LEVELS.indexOf(level)

export const isLogLevel = (value: unknown): value is LogLevel =>
  typeof value === 'string' && (LOG_LEVELS as readonly string[]).includes(value)
