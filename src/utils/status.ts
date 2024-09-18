import chalk from 'chalk'

export default function statusString(
  status: number,
  useColors: boolean
): string {
  const color =
    status >= 500
      ? 'red'
      : status >= 400
        ? 'yellow'
        : status >= 300
          ? 'cyan'
          : status >= 200
            ? 'green'
            : 'white'
  return useColors ? chalk[color](status.toString()) : status.toString()
}
