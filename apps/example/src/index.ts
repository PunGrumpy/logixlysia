import { swagger } from '@elysiajs/swagger'
import { Elysia } from 'elysia'
import { logixlysia } from 'logixlysia'
import packageJson from '../../../packages/cli/package.json'
import { routes } from './routes'

export const app = new Elysia({
  name: 'Elysia with Logixlysia'
})
  .use(
    swagger({
      documentation: {
        info: {
          title: 'Elysia with Logixlysia',
          version: packageJson.version
        }
      },
      scalarConfig: {
        theme: 'saturn'
      }
    })
  )
  .use(
    logixlysia({
      config: {
        showStartupMessage: true,
        startupMessageFormat: 'simple',
        timestamp: {
          translateTime: 'yyyy-mm-dd HH:MM:ss'
        },
        customLogFormat:
          '🦊 {now} {level} {duration} {method} {pathname} {status} {message} {ip} {context}',
        logFilePath: './logs/example.log',
        ip: true
      }
    })
  )
  .use(routes)

app.listen(process.env.PORT ?? 3001)
