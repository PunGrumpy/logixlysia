import chalk from 'chalk'
import { StatusMap } from 'elysia'

export function getStatusCode(status: string | number): number {
	if (typeof status === 'number') return status
	return (StatusMap as Record<string, number>)[status] || 500
}

export default function statusString(
	status: number,
	useColors: boolean
): string {
	const statusStr = status.toString()
	if (!useColors) return statusStr

	if (status >= 500) return chalk.red(statusStr)
	if (status >= 400) return chalk.yellow(statusStr)
	if (status >= 300) return chalk.cyan(statusStr)
	if (status >= 200) return chalk.green(statusStr)
	return chalk.white(statusStr)
}
