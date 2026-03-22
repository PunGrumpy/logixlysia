import { DynamicCodeBlock } from 'fumadocs-ui/components/dynamic-codeblock'
import { cn } from '@/lib/utils'

const code = `import { Elysia } from 'elysia'
import logixlysia from 'logixlysia'

const app = new Elysia({ name: 'Elysia with Logixlysia' })
  .use(
    logixlysia({
      config: {
        service: 'api-server',
        showStartupMessage: true,
        startupMessageFormat: 'banner',
        showContextTree: true,
        contextDepth: 2,
        slowThreshold: 500,
        verySlowThreshold: 1000,
        timestamp: {
          translateTime: 'yyyy-mm-dd HH:MM:ss.SSS'
        },
        ip: true
      }
    })
  )
  .get('/', () => {
        return { message: 'Welcome to Basic Elysia with Logixlysia' }
    })

app.listen(3000)`

export const Demo = () => (
  <div
    className={cn(
      '[&>figure]:font-mono',
      '[&>figure]:text-base',
      '[&_pre]:p-4'
    )}
  >
    <DynamicCodeBlock
      code={code}
      lang="typescript"
      options={{
        themes: {
          light: 'github-light',
          dark: 'vesper'
        }
      }}
    />
  </div>
)
