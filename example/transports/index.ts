import { Elysia } from 'elysia'

import logixlysia from '../../src/index'
import MyCustomTransport from './myCustomTransport'

const app = new Elysia()
	.use(
		logixlysia({
			config: {
				transports: [new MyCustomTransport()]
			}
		})
	)
	.get('/', () => {
		return {
			message: 'Basic Example'
		}
	})

app.listen(3000)
