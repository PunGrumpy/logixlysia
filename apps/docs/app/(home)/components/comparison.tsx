import {
  IconCheck,
  IconInfoCircle,
  IconMinus,
  IconTerminal2,
} from "@tabler/icons-react";

import { Icons } from "@/components/icons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const features = [
  {
    avatar: <IconTerminal2 className="size-6 text-muted-foreground" />,
    description: "Fast to start, but quickly becomes noisy at scale.",
    items: [
      {
        caption: "You can log anywhere without installing anything.",
        color: "text-vesper-peppermint",
        icon: IconCheck,
        text: "Zero setup",
      },
      {
        caption:
          "You’ll usually have to manually add method/path/status/duration for each handler.",
        color: "text-muted-foreground",
        icon: IconMinus,
        text: "No request context by default",
      },
      {
        caption:
          "Message formats drift across teams and files, making logs harder to scan.",
        color: "text-muted-foreground",
        icon: IconMinus,
        text: "Hard to keep consistent",
      },
      {
        caption:
          "Structured logs and levels help when you need filtering, dashboards, and alerting.",
        color: "text-muted-foreground",
        icon: IconMinus,
        text: "Limited filtering and structure",
      },
    ],
    label: "console.log",
  },
  {
    avatar: <Icons.logo className="size-6" />,
    description:
      "Elysia-first logger—sensible defaults with deep configuration when you need it.",
    items: [
      {
        caption: "You need to install the package and configure it.",
        color: "text-muted-foreground",
        icon: IconMinus,
        text: "Zero setup",
      },
      {
        caption:
          "Plug in once and get consistent request logs across the whole app.",
        color: "text-vesper-peppermint",
        icon: IconCheck,
        text: "Elysia plugin integration",
      },
      {
        caption:
          "Uses Pino under the hood and exposes it (e.g. `store.pino`) for advanced usage.",
        color: "text-vesper-peppermint",
        icon: IconCheck,
        text: "Pino built-in (and exposed)",
      },
      {
        caption: "Capture method/path/status/duration, with optional IP.",
        color: "text-vesper-peppermint",
        icon: IconCheck,
        text: "Request context included",
      },
      {
        caption:
          "Customize message templates and timestamp translation for readable logs.",
        color: "text-vesper-peppermint",
        icon: IconCheck,
        text: "Custom log format + timestamps",
      },
      {
        caption:
          "Filter logs by level, HTTP method, and status codes to reduce noise.",
        color: "text-vesper-peppermint",
        icon: IconCheck,
        text: "Log filtering",
      },
      {
        caption:
          "Send logs to custom transports, or run in transport-only mode when needed.",
        color: "text-vesper-peppermint",
        icon: IconCheck,
        text: "Transports",
      },
      {
        caption:
          "Write to a log file with rotation by size/time, retention, and optional gzip compression.",
        color: "text-vesper-peppermint",
        icon: IconCheck,
        text: "File logging + rotation",
      },
      {
        caption:
          "Use `info/warn/error/debug` with optional context and skip duplicate auto-logs.",
        color: "text-vesper-peppermint",
        icon: IconCheck,
        text: "Custom log methods + context",
      },
      {
        caption:
          "Disable internal console logging, disable file logging, or use transports only.",
        color: "text-vesper-peppermint",
        icon: IconCheck,
        text: "Runtime controls",
      },
      {
        caption:
          "Choose banner vs simple startup message, or disable startup logs entirely.",
        color: "text-vesper-peppermint",
        icon: IconCheck,
        text: "Startup banner",
      },
    ],
    label: "Logixlysia",
  },
  {
    avatar: (
      <div className="grid size-6 place-items-center rounded-full bg-foreground/5 ring-1 ring-foreground/10">
        <span className="text-muted-foreground text-xs">+</span>
      </div>
    ),
    description:
      "Great building blocks, but needs more wiring for Elysia apps.",
    items: [
      {
        caption:
          "You can integrate with many transports, formats, and processors.",
        color: "text-vesper-peppermint",
        icon: IconCheck,
        text: "Flexible ecosystem",
      },
      {
        caption:
          "You’ll often have to build middleware hooks to capture request context consistently.",
        color: "text-muted-foreground",
        icon: IconMinus,
        text: "More app wiring",
      },
      {
        caption:
          "Different environments often need different output formats and transports.",
        color: "text-muted-foreground",
        icon: IconMinus,
        text: "More configuration",
      },
      {
        caption:
          "Without conventions, teams can end up with multiple styles and duplicate logic.",
        color: "text-muted-foreground",
        icon: IconMinus,
        text: "Easy to drift",
      },
    ],
    label: "generic logger",
  },
];

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
            "z-10 min-h-fit w-full flex-1 rounded-xl border p-12 shadow-xl",
            "lg:last:rounded-l-none lg:first:rounded-r-none",
            index === 1 && "z-20 border-vesper-peppermint/50"
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
              {feature.items.map((item) => (
                <div className="flex items-center gap-3" key={item.text}>
                  <item.icon className={cn("size-5 shrink-0", item.color)} />
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
);
