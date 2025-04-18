import type { LogLevel } from '../interfaces'
import { LogLevelColorMap } from './color-mapping'

export default function logString(level: LogLevel, useColors: boolean): string {
  const levelStr = level.toUpperCase()
  return useColors
    ? LogLevelColorMap[levelStr]?.(levelStr.padEnd(7)) || levelStr
    : levelStr.padEnd(7)
}
