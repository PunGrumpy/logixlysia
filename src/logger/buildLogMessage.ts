import chalk from 'chalk'

import {
	durationString,
	formatTimestamp,
	logString,
	methodString,
	pathString,
	statusString
} from '../helpers'
import type {
	LogComponents,
	LogData,
	LogLevel,
	Options,
	RequestInfo,
	StoreData
} from '../interfaces'

const defaultLogFormat =
	'🦊 {now} {level} {duration} {method} {pathname} {status} {message} {ip}'

function shouldUseColors(useColors: boolean, options?: Options): boolean {
	if (options?.config?.useColors !== undefined) {
		return options.config.useColors && process.env.NO_COLOR === undefined
	}
	return useColors && process.env.NO_COLOR === undefined
}

export function buildLogMessage(
	level: LogLevel,
	request: RequestInfo,
	data: LogData,
	store: StoreData,
	options?: Options,
	useColors = true
): string {
	const actuallyUseColors = shouldUseColors(useColors, options)
	const now = new Date()
	const components: LogComponents = {
		now: actuallyUseColors
			? chalk.bgYellow(
					chalk.black(formatTimestamp(now, options?.config?.timestamp))
				)
			: formatTimestamp(now, options?.config?.timestamp),
		epoch: Math.floor(now.getTime() / 1000).toString(),
		level: logString(level, useColors),
		duration: durationString(store.beforeTime, useColors),
		method: methodString(request.method, useColors),
		pathname: pathString(request),
		status: statusString(data.status || 200, useColors),
		message: data.message || '',
		ip:
			options?.config?.ip && request.headers.get('x-forwarded-for')
				? `IP: ${request.headers.get('x-forwarded-for')}`
				: ''
	}

	const logFormat = options?.config?.customLogFormat || defaultLogFormat

	return logFormat.replace(/{(\w+)}/g, (_, key: string) => {
		if (key in components) {
			return components[key as keyof LogComponents] || ''
		}
		return ''
	})
}
