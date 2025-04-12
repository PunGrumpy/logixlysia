import { swagger } from '@elysiajs/swagger'
import { Elysia } from 'elysia'

import logixlysia from '../src/index'

const app = new Elysia({
	name: 'Basic Example'
})
	.use(
		swagger({
			exclude: '/'
		})
	)
	.use(
		logixlysia({
			config: {
				showStartupMessage: true,
				startupMessageFormat: 'simple',
				timestamp: {
					translateTime: 'yyyy-mm-dd HH:MM:ss.SSS'
				},
				logFilePath: './logs/example.log',
				ip: true,
				customLogFormat:
					'🦊 {now} {level} {duration} {method} {pathname} {status} {message} {ip}'
				// logFilter: {
				//   level: ['ERROR', 'WARNING'],
				//   status: [500, 404],
				//   method: 'GET'
				// }
			}
		})
	)
	.get('/', () => {
		return { message: 'Welcome to Basic Elysia with Logixlysia' }
	})
	.get('/success/:id', ({ params: { id } }) => {
		return {
			id,
			message: `Successfully retrieved item ${id}`
		}
	})
	.get('/error', () => {
		throw new Error('Internal Server Error')
	})
	.get('/custom-error', () => {
		throw { status: 503, message: 'Service Unavailable' }
	})
	.post('/items', ({ body }) => {
		return {
			message: 'Item created',
			data: body
		}
	})
	.put('/items/:id', ({ params: { id }, body }) => {
		return {
			message: `Item ${id} updated`,
			data: body
		}
	})
	.patch('/items/:id', ({ params: { id }, body }) => {
		return {
			message: `Item ${id} partially updated`,
			data: body
		}
	})
	.delete('/items/:id', ({ params: { id } }) => {
		return {
			message: `Item ${id} deleted`
		}
	})
	.post('/status', ({ set }) => {
		set.status = 201 // Use number status code
		return { message: 'Created with 201 status' }
	})
	.get('/rate-limited', ({ set }) => {
		set.status = 'Too Many Requests' // Use string status code
		return { message: 'Too Many Requests' }
	})

app.listen(3000)

// header for testing
// key: "Authorization"
// value: "Bearer 1234567890"
