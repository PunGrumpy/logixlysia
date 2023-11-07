import * as pc from 'picocolors'

enum LogLevel {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR'
}

interface LogData {
  status?: number
  message?: string
}

interface ColorMap {
  [key: string]: (str: string) => string
}

/**
 * Converts a log level to a colored string representation.
 *
 * @param log - The log level (e.g., 'INFO', 'WARNING').
 * @returns A colored string representing the log level.
 */
function logString(log: string): string {
  const colorMap: ColorMap = {
    INFO: pc.bgGreen,
    WARNING: pc.bgYellow,
    ERROR: pc.bgRed
  }

  const colorFunction = colorMap[log]

  if (colorFunction) {
    return colorFunction(pc.black(log.padEnd(7)))
  }

  return log
}

export { LogLevel, LogData, logString }
