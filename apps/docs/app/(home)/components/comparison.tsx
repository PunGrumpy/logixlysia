import {
  IconCheck,
  IconInfoCircle,
  IconMinus,
  IconTerminal2
} from '@tabler/icons-react'
import { Icons } from '@/components/icons'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const features = [
  {
    label: 'console.log',
    description: 'Fast to start, but quickly becomes noisy at scale.',
    avatar: <IconTerminal2 className="size-6 text-muted-foreground" />,
    items: [
      {
        text: 'Zero setup',
        icon: IconCheck,
        color: 'text-vesper-peppermint',
        caption: 'You can log anywhere without installing anything.'
      },
      {
        text: 'No request context by default',
        icon: IconMinus,
        color: 'text-muted-foreground',
        caption:
          'You’ll usually have to manually add method/path/status/duration for each handler.'
      },
      {
        text: 'Hard to keep consistent',
        icon: IconMinus,
        color: 'text-muted-foreground',
        caption:
          'Message formats drift across teams and files, making logs harder to scan.'
      },
      {
        text: 'Limited filtering and structure',
        icon: IconMinus,
        color: 'text-muted-foreground',
        caption:
          'Structured logs and levels help when you need filtering, dashboards, and alerting.'
      }
    ]
  },
  {
    label: 'Logixlysia',
    description:
      'Elysia-first logger—sensible defaults with deep configuration when you need it.',
    avatar: <Icons.logo className="size-6" />,
    items: [
      {
        text: 'Zero setup',
        icon: IconMinus,
        color: 'text-muted-foreground',
        caption: 'You need to install the package and configure it.'
      },
      {
        text: 'Elysia plugin integration',
        icon: IconCheck,
        color: 'text-vesper-peppermint',
        caption:
          'Plug in once and get consistent request logs across the whole app.'
      },
      {
        text: 'Pino built-in (and exposed)',
        icon: IconCheck,
        color: 'text-vesper-peppermint',
        caption:
          'Uses Pino under the hood and exposes it (e.g. `store.pino`) for advanced usage.'
      },
      {
        text: 'Request context included',
        icon: IconCheck,
        color: 'text-vesper-peppermint',
        caption: 'Capture method/path/status/duration, with optional IP.'
      },
      {
        text: 'Custom log format + timestamps',
        icon: IconCheck,
        color: 'text-vesper-peppermint',
        caption:
          'Customize message templates and timestamp translation for readable logs.'
      },
      {
        text: 'Log filtering',
        icon: IconCheck,
        color: 'text-vesper-peppermint',
        caption:
          'Filter logs by level, HTTP method, and status codes to reduce noise.'
      },
      {
        text: 'Transports',
        icon: IconCheck,
        color: 'text-vesper-peppermint',
        caption:
          'Send logs to custom transports, or run in transport-only mode when needed.'
      },
      {
        text: 'File logging + rotation',
        icon: IconCheck,
        color: 'text-vesper-peppermint',
        caption:
          'Write to a log file with rotation by size/time, retention, and optional gzip compression.'
      },
      {
        text: 'Custom log methods + context',
        icon: IconCheck,
        color: 'text-vesper-peppermint',
        caption:
          'Use `info/warn/error/debug` with optional context and skip duplicate auto-logs.'
      },
      {
        text: 'Runtime controls',
        icon: IconCheck,
        color: 'text-vesper-peppermint',
        caption:
          'Disable internal console logging, disable file logging, or use transports only.'
      },
      {
        text: 'Startup banner',
        icon: IconCheck,
        color: 'text-vesper-peppermint',
        caption:
          'Choose banner vs simple startup message, or disable startup logs entirely.'
      }
    ]
  },
  {
    label: 'generic logger',
    description:
      'Great building blocks, but needs more wiring for Elysia apps.',
    avatar: (
      <div className="grid size-6 place-items-center rounded-full bg-foreground/5 ring-1 ring-foreground/10">
        <span className="text-muted-foreground text-xs">+</span>
      </div>
    ),
    items: [
      {
        text: 'Flexible ecosystem',
        icon: IconCheck,
        color: 'text-vesper-peppermint',
        caption:
          'You can integrate with many transports, formats, and processors.'
      },
      {
        text: 'More app wiring',
        icon: IconMinus,
        color: 'text-muted-foreground',
        caption:
          'You’ll often have to build middleware hooks to capture request context consistently.'
      },
      {
        text: 'More configuration',
        icon: IconMinus,
        color: 'text-muted-foreground',
        caption:
          'Different environments often need different output formats and transports.'
      },
      {
        text: 'Easy to drift',
        icon: IconMinus,
        color: 'text-muted-foreground',
        caption:
          'Without conventions, teams can end up with multiple styles and duplicate logic.'
      }
    ]
  }
]

export const Comparison = () => (
  <section className="grid gap-12">
    <div className="mx-auto grid max-w-2xl gap-4 text-center">
      <h2 className="text-balance font-medium font-serif text-3xl sm:text-4xl md:text-5xl">
        Why choose <span className="italic">Logixlysia</span>?
      </h2>
      <p className="text-balance text-lg text-muted-foreground">
        Logixlysia is designed to make Elysia.js request logging consistent,
        readable, and production-ready. Here's how it compares.
      </p>
    </div>

    <div className="isolate mx-auto flex flex-col items-center gap-4 -space-x-px lg:flex-row lg:gap-0">
      {features.map((feature, index) => (
        <Card
          className={cn(
            'z-10 min-h-fit w-full flex-1 rounded-xl border p-12 shadow-xl',
            'lg:last:rounded-l-none lg:first:rounded-r-none',
            index === 1 && 'z-20 border-vesper-peppermint/50'
          )}
          key={feature.label}
        >
          <CardHeader className="p-0">
            {feature.avatar}
            <CardTitle className="mt-4 font-medium text-lg tracking-tight">
              {feature.label}
            </CardTitle>
            <CardDescription className="text-muted-foreground text-sm">
              {feature.description}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6 p-0">
            <div className="flex flex-col gap-3">
              {feature.items.map(item => (
                <div className="flex items-center gap-3" key={item.text}>
                  <item.icon className={cn('size-5 shrink-0', item.color)} />
                  <div className="flex flex-1 items-center gap-4">
                    <span className="flex-1 font-medium text-sm">
                      {item.text}
                    </span>
                    <Tooltip>
                      <TooltipTrigger>
                        <IconInfoCircle className="size-6 shrink-0 text-muted-foreground/50" />
                      </TooltipTrigger>
                      <TooltipContent>{item.caption}</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  </section>
)
