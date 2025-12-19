const STATUS_BY_NAME = new Map<string, number>([
  ['OK', 200],
  ['Not Found', 404]
])

export const getStatusCode = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const known = STATUS_BY_NAME.get(value)
    return known ?? 500
  }

  return 500
}
