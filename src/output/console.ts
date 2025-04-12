import type {
	LogData,
	LogLevel,
	Options,
	RequestInfo,
	StoreData
} from '../interfaces'
import { buildLogMessage } from '../logger/buildLogMessage'

export async function logToTransports(
	level: LogLevel,
	request: RequestInfo,
	data: LogData,
	store: StoreData,
	options?: Options
): Promise<void> {
	if (!options?.config?.transports || options.config.transports.length === 0) {
		return
	}

	const message = buildLogMessage(level, request, data, store, options, false)

	const promises = options.config.transports.map(transport =>
		transport.log(level, message, { request, data, store })
	)

	await Promise.all(promises)
}
