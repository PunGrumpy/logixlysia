import { LogLevel, Options } from '../interfaces'

const checkFilter = (filterValue: any, value: any) =>
  Array.isArray(filterValue)
    ? filterValue.includes(value)
    : filterValue === value

export function filterLog(
  logLevel: LogLevel,
  status: number,
  method: string,
  options?: Options
): boolean {
  const filter = options?.config?.logFilter
  if (!filter) return true

  return (
    (!filter.level || checkFilter(filter.level, logLevel)) &&
    (!filter.status || checkFilter(filter.status, status)) &&
    (!filter.method || checkFilter(filter.method, method))
  )
}
