import { LogLevel } from "~/types";
import { LogLevelColorMap } from "~/utils/colorMapping";

/**
 * Converts the log level to a string.
 *
 * @param {LogLevel} level The log level.
 * @param {boolean} useColors - Whether to apply colors to the output.
 * @returns {string} The log level as a string.
 */
const logString = (level: LogLevel, useColors: boolean): string => {
  const levelStr = level.toUpperCase();
  return useColors
    ? LogLevelColorMap[levelStr]?.(levelStr.padEnd(7)) || levelStr
    : levelStr.padEnd(7);
};

export default logString;
