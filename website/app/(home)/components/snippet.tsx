import { cn } from '@/lib/utils'
import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock'

const code = `import { Elysia } from 'elysia'
import logixlysia from 'logixlysia'

const app = new Elysia({
    name: "Elysia with Logixlysia"
})
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
        }
    })
    .get('/', () => {
        return { message: 'Welcome to Basic Elysia with Logixlysia' }
    }
        
app.listen(3000)`

export const HeroSnippet = () => (
  <div
    className={cn(
      '[&>figure]:rounded-none',
      '[&>figure]:border-none',
      '[&>figure]:text-base',
      '[&_pre]:p-6'
    )}
  >
    <DynamicCodeBlock lang="typescript" code={code} />
  </div>
)
