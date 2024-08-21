import { LogLevel, Options } from "~/types";

const checkFilter = (filterValue: any, value: any) =>
  Array.isArray(filterValue)
    ? filterValue.includes(value)
    : filterValue === value;

/**
 * Filters log messages.
 *
 * @param {LogLevel} logLevel The log level.
 * @param {number} status The status code.
 * @param {string} method The method.
 * @param {Options} options The options.
 * @returns {boolean} `true` if the log message should be logged, otherwise `false`.
 */
export function filterLog(
  logLevel: LogLevel,
  status: number,
  method: string,
  options?: Options,
): boolean {
  const filter = options?.config?.logFilter;
  if (!filter) return true;

  return (
    (!filter.level || checkFilter(filter.level, logLevel)) &&
    (!filter.status || checkFilter(filter.status, status)) &&
    (!filter.method || checkFilter(filter.method, method))
  );
}
