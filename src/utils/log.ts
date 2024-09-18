import { LogLevel } from '../types'
import { LogLevelColorMap } from './colorMapping'

export default function logString(level: LogLevel, useColors: boolean): string {
  const levelStr = level.toUpperCase()
  return useColors
    ? LogLevelColorMap[levelStr]?.(levelStr.padEnd(7)) || levelStr
    : levelStr.padEnd(7)
}
