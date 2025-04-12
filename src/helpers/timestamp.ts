import type { TimestampConfig } from '../interfaces'

// const DEFAULT_TIMESTAMP_FORMAT = 'yyyy-mm-dd HH:MM:ss'
const SYS_TIME = 'SYS:STANDARD'

const pad = (n: number): string => n.toString().padStart(2, '0')

function formatSystemTime(date: Date): string {
	const year = date.getFullYear()
	const month = pad(date.getMonth() + 1)
	const day = pad(date.getDate())
	const hours = pad(date.getHours())
	const minutes = pad(date.getMinutes())
	const seconds = pad(date.getSeconds())
	const ms = date.getMilliseconds().toString().padStart(3, '0')

	return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`
}

function formatCustomTime(date: Date, format: string): string {
	const tokens: { [key: string]: string | number } = {
		yyyy: date.getFullYear(),
		yy: date.getFullYear().toString().slice(-2),
		mm: pad(date.getMonth() + 1),
		dd: pad(date.getDate()),
		HH: pad(date.getHours()),
		MM: pad(date.getMinutes()),
		ss: pad(date.getSeconds()),
		SSS: pad(date.getMilliseconds()),
		Z: -date.getTimezoneOffset() / 60
	}

	return format.replace(/yyyy|yy|mm|dd|HH|MM|ss|SSS|Z/g, match =>
		(tokens[match] ?? '').toString()
	)
}

export function formatTimestamp(date: Date, config?: TimestampConfig): string {
	if (!config || !config.translateTime) {
		return date.toISOString()
	}

	if (config.translateTime === true || config.translateTime === SYS_TIME) {
		return formatSystemTime(date)
	}

	return formatCustomTime(date, config.translateTime)
}
