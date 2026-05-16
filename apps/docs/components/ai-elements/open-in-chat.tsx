/** biome-ignore-all lint/a11y/useAnchorContent: Anchor content is not needed for this component */
'use client'

import {
  IconChevronDown,
  IconExternalLink,
  IconMessageCircle
} from '@tabler/icons-react'
import Link from 'fumadocs-core/link'
import { type ComponentProps, createContext, use } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

const providers = {
  github: {
    title: 'Open in GitHub',
    createUrl: (url: string) => url,
    icon: (
      <svg fill="currentColor" role="img" viewBox="0 0 24 24">
        <title>GitHub</title>
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
      </svg>
    )
  },
  scira: {
    title: 'Open in Scira',
    createUrl: (q: string) =>
      `https://scira.ai/?${new URLSearchParams({
        q
      })}`,
    icon: (
      <svg
        fill="none"
        height="934"
        viewBox="0 0 910 934"
        width="910"
        xmlns="http://www.w3.org/2000/svg"
      >
        <title>Scira AI</title>
        <path
          d="M647.66 197.78C569.13 189.05 525.5 145.42 516.77 66.88C508.05 145.42 464.42 189.05 385.88 197.78C464.42 206.5 508.05 250.13 516.77 328.67C525.5 250.13 569.13 206.5 647.66 197.78Z"
          fill="currentColor"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="8"
        />
        <path
          d="M516.774 304.217C510.299 275.491 498.208 252.087 480.335 234.214C462.462 216.341 439.058 204.251 410.333 197.775C439.059 191.3 462.462 179.209 480.335 161.336C498.208 143.463 510.299 120.06 516.774 91.334C523.25 120.059 535.34 143.463 553.213 161.336C571.086 179.209 594.49 191.3 623.216 197.775C594.49 204.251 571.086 216.341 553.213 234.214C535.34 252.087 523.25 275.491 516.774 304.217Z"
          fill="currentColor"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="8"
        />
        <path
          d="M857.5 508.116C763.259 497.644 710.903 445.288 700.432 351.047C689.961 445.288 637.605 497.644 543.364 508.116C637.605 518.587 689.961 570.943 700.432 665.184C710.903 570.943 763.259 518.587 857.5 508.116Z"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="20"
        />
        <path
          d="M700.432 615.957C691.848 589.05 678.575 566.357 660.383 548.165C642.191 529.973 619.499 516.7 592.593 508.116C619.499 499.533 642.191 486.258 660.383 468.066C678.575 449.874 691.848 427.181 700.432 400.274C709.015 427.181 722.289 449.874 740.481 468.066C758.673 486.258 781.365 499.533 808.271 508.116C781.365 516.7 758.673 529.973 740.481 548.165C722.289 566.357 709.015 589.05 700.432 615.957Z"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="20"
        />
        <path
          d="M889.95 121.24C831.05 114.69 798.33 81.97 791.78 23.07C785.24 81.97 752.52 114.69 693.61 121.24C752.52 127.78 785.24 160.5 791.78 219.4C798.33 160.5 831.05 127.78 889.95 121.24Z"
          fill="currentColor"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="8"
        />
        <path
          d="M791.78 196.8C786.7 176.94 777.87 160.57 765.16 147.86C752.45 135.15 736.08 126.32 716.23 121.24C736.08 116.15 752.45 107.32 765.16 94.62C777.87 81.91 786.7 65.54 791.78 45.68C796.87 65.54 805.7 81.91 818.4 94.62C831.11 107.32 847.48 116.15 867.34 121.24C847.48 126.32 831.11 135.15 818.4 147.86C805.69 160.57 796.87 176.94 791.78 196.8Z"
          fill="currentColor"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="8"
        />
        <path
          d="M760.63 764.34C720.72 814.62 669.84 855.1 611.87 882.69C553.91 910.29 490.4 924.26 426.21 923.53C362.02 922.81 298.85 907.42 241.52 878.53C184.19 849.64 134.23 808.03 95.45 756.86C56.68 705.7 30.12 646.35 17.81 583.34C5.5 520.34 7.76 455.35 24.43 393.36C41.09 331.36 71.71 274 113.95 225.66C156.18 177.32 208.92 139.27 268.12 114.44"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="30"
        />
      </svg>
    )
  },
  chatgpt: {
    title: 'Open in ChatGPT',
    createUrl: (prompt: string) =>
      `https://chatgpt.com/?${new URLSearchParams({
        hints: 'search',
        prompt
      })}`,
    icon: (
      <svg
        fill="currentColor"
        role="img"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <title>OpenAI</title>
        <path d="M22.28 9.82a5.98 5.98 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9A6.07 6.07 0 0 0 4.98 4.18a5.98 5.98 0 0 0-4 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.51 2.9A5.98 5.98 0 0 0 13.26 24a6.06 6.06 0 0 0 5.77-4.21 5.99 5.99 0 0 0 4-2.9 6.06 6.06 0 0 0-.75-7.07zm-9.02 12.61a4.48 4.48 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.79.79 0 0 0 .39-.68v-6.74l2.02 1.17a.07.07 0 0 1 .04.05v5.58a4.5 4.5 0 0 1-4.49 4.49zm-9.66-4.13a4.47 4.47 0 0 1-.53-3.01l.14.09 4.78 2.76a.77.77 0 0 0 .78 0l5.84-3.37v2.33a.08.08 0 0 1-.03.06L9.74 19.95a4.5 4.5 0 0 1-6.14-1.65zM2.34 7.9a4.49 4.49 0 0 1 2.37-1.97V11.6a.77.77 0 0 0 .39.68l5.81 3.35-2.02 1.17a.08.08 0 0 1-.07 0l-4.83-2.79A4.5 4.5 0 0 1 2.34 7.87zm16.6 3.86L13.1 8.36 15.12 7.2a.08.08 0 0 1 .07 0l4.83 2.79a4.49 4.49 0 0 1-.68 8.1v-5.68a.79.79 0 0 0-.41-.67zm2.01-3.02l-.14-.09-4.77-2.78a.78.78 0 0 0-.79 0L9.41 9.23V6.9a.07.07 0 0 1 .03-.06l4.83-2.79a4.5 4.5 0 0 1 6.68 4.66zM8.31 12.86l-2.02-1.16a.08.08 0 0 1-.04-.06V6.07a4.5 4.5 0 0 1 7.38-3.45l-.14.08L8.7 5.46a.79.79 0 0 0-.39.68zm1.1-2.37l2.6-1.5 2.61 1.5v3l-2.6 1.5-2.61-1.5Z" />
      </svg>
    )
  },
  claude: {
    title: 'Open in Claude',
    createUrl: (q: string) =>
      `https://claude.ai/new?${new URLSearchParams({
        q
      })}`,
    icon: (
      <svg
        fill="currentColor"
        role="img"
        viewBox="0 0 12 12"
        xmlns="http://www.w3.org/2000/svg"
      >
        <title>Claude</title>
        <path
          clipRule="evenodd"
          d="M2.35 7.98L4.71 6.65L4.75 6.54L4.71 6.48H4.6L4.21 6.45L2.86 6.41L1.69 6.37L0.55 6.31L0.27 6.24L0 5.89L0.03 5.72L0.27 5.56L0.61 5.59L1.37 5.64L2.51 5.72L3.34 5.76L4.56 5.89H4.75L4.78 5.81L4.72 5.76L4.66 5.72L3.48 4.92L2.21 4.07L1.54 3.59L1.18 3.34L1 3.11L0.92 2.61L1.25 2.25L1.69 2.28L1.8 2.31L2.25 2.65L3.2 3.39L4.44 4.3L4.63 4.46L4.7 4.41L4.71 4.37L4.63 4.23L3.95 3.01L3.23 1.76L2.9 1.25L2.82 0.94C2.79 0.82 2.77 0.7 2.77 0.57L3.14 0.07L3.35 0L3.85 0.07L4.06 0.25L4.37 0.96L4.87 2.07L5.64 3.59L5.87 4.03L5.99 4.45L6.04 4.58H6.12V4.51L6.18 3.65L6.3 2.6L6.42 1.26L6.46 0.88L6.64 0.42L7.02 0.18L7.31 0.32L7.55 0.66L7.52 0.88L7.37 1.81L7.09 3.26L6.91 4.23H7.02L7.14 4.11L7.63 3.45L8.46 2.42L8.82 2.01L9.25 1.56L9.52 1.35H10.04L10.42 1.91L10.25 2.49L9.72 3.17L9.28 3.74L8.64 4.59L8.25 5.27L8.28 5.32L8.38 5.31L9.81 5.01L10.58 4.87L11.5 4.71L11.92 4.91L11.96 5.1L11.8 5.51L10.81 5.75L9.66 5.98L7.94 6.39L7.92 6.4L7.94 6.43L8.72 6.51L9.05 6.52H9.86L11.37 6.64L11.76 6.9L12 7.22L11.96 7.46L11.35 7.77L10.53 7.57L8.62 7.12L7.96 6.95H7.87V7.01L8.42 7.54L9.42 8.45L10.68 9.61L10.74 9.9L10.58 10.13L10.41 10.11L9.31 9.28L8.88 8.9L7.92 8.09H7.85V8.18L8.07 8.5L9.25 10.26L9.31 10.8L9.22 10.98L8.92 11.09L8.59 11.03L7.9 10.06L7.19 8.98L6.62 8.01L6.55 8.05L6.21 11.68L6.05 11.86L5.69 12L5.39 11.77L5.23 11.4L5.39 10.66L5.58 9.7L5.74 8.93L5.88 7.98L5.97 7.67L5.96 7.64L5.89 7.65L5.17 8.64L4.08 10.11L3.22 11.03L3.01 11.11L2.66 10.93L2.69 10.6L2.89 10.3L4.08 8.79L4.8 7.84L5.27 7.3L5.27 7.22H5.24L2.07 9.28L1.5 9.35L1.26 9.13L1.29 8.75L1.4 8.63L2.36 7.97L2.35 7.98Z"
          fillRule="evenodd"
        />
      </svg>
    )
  },
  t3: {
    title: 'Open in T3 Chat',
    createUrl: (q: string) =>
      `https://t3.chat/new?${new URLSearchParams({
        q
      })}`,
    icon: <IconMessageCircle />
  },
  v0: {
    title: 'Open in v0',
    createUrl: (q: string) =>
      `https://v0.app?${new URLSearchParams({
        q
      })}`,
    icon: (
      <svg
        fill="currentColor"
        viewBox="0 0 147 70"
        xmlns="http://www.w3.org/2000/svg"
      >
        <title>v0</title>
        <path d="M56 50.2V14H70V60.16C70 65.59 65.59 70 60.16 70C57.56 70 55 69 53.16 67.16L0 14H19.8L56 50.2Z" />
        <path d="M147 56H133V23.95L100.95 56H133V70H96.69C85.81 70 77 61.19 77 50.31V14H91V46.16L123.16 14H91V0H127.31C138.19 0 147 8.81 147 19.69V56Z" />
      </svg>
    )
  },
  cursor: {
    title: 'Open in Cursor',
    createUrl: (text: string) => {
      const url = new URL('https://cursor.com/link/prompt')
      url.searchParams.set('text', text)
      return url.toString()
    },
    icon: (
      <svg
        version="1.1"
        viewBox="0 0 466.73 532.09"
        xmlns="http://www.w3.org/2000/svg"
      >
        <title>Cursor</title>
        <path
          d="M457.43,125.94L244.42,2.96c-6.84-3.95-15.28-3.95-22.12,0L9.3,125.94c-5.75,3.32-9.3,9.46-9.3,16.11v247.99c0,6.65,3.55,12.79,9.3,16.11l213.01,122.98c6.84,3.95,15.28,3.95,22.12,0l213.01-122.98c5.75-3.32,9.3-9.46,9.3-16.11v-247.99c0-6.65-3.55-12.79-9.3-16.11h-.01ZM444.05,151.99l-205.63,356.16c-1.39,2.4-5.06,1.42-5.06-1.36v-233.21c0-4.66-2.49-8.97-6.53-11.31L24.87,145.67c-2.4-1.39-1.42-5.06,1.36-5.06h411.26c5.84,0,9.49,6.33,6.57,11.39h-.01Z"
          fill="currentColor"
        />
      </svg>
    )
  }
}

const OpenInContext = createContext<{ query: string } | undefined>(undefined)

const useOpenInContext = () => {
  const context = use(OpenInContext)
  if (!context) {
    throw new Error('OpenIn components must be used within an OpenIn provider')
  }
  return context
}

export type OpenInProps = ComponentProps<typeof DropdownMenu> & {
  query: string
}

export const OpenIn = ({ query, ...props }: OpenInProps) => (
  <OpenInContext.Provider value={{ query }}>
    <DropdownMenu {...props} />
  </OpenInContext.Provider>
)

export type OpenInContentProps = ComponentProps<typeof DropdownMenuContent>

export const OpenInContent = ({ className, ...props }: OpenInContentProps) => (
  <DropdownMenuContent
    align="start"
    className={cn('w-[240px]', className)}
    {...props}
  />
)

export type OpenInItemProps = ComponentProps<typeof DropdownMenuItem>

export const OpenInItem = (props: OpenInItemProps) => (
  <DropdownMenuItem asChild {...props} />
)

export type OpenInLabelProps = ComponentProps<typeof DropdownMenuLabel>

export const OpenInLabel = (props: OpenInLabelProps) => (
  <DropdownMenuLabel {...props} />
)

export type OpenInSeparatorProps = ComponentProps<typeof DropdownMenuSeparator>

export const OpenInSeparator = (props: OpenInSeparatorProps) => (
  <DropdownMenuSeparator {...props} />
)

export type OpenInTriggerProps = ComponentProps<typeof DropdownMenuTrigger>

export const OpenInTrigger = ({ children, ...props }: OpenInTriggerProps) => (
  <DropdownMenuTrigger {...props}>
    {children ?? (
      <Button type="button" variant="outline">
        Open in chat
        <IconChevronDown className="size-4" />
      </Button>
    )}
  </DropdownMenuTrigger>
)

export type OpenInChatGPTProps = ComponentProps<typeof DropdownMenuItem>

export const OpenInChatGPT = (props: OpenInChatGPTProps) => {
  const { query } = useOpenInContext()
  return (
    <DropdownMenuItem asChild {...props}>
      <Link
        className="flex items-center gap-2"
        external
        href={providers.chatgpt.createUrl(query)}
      >
        <span className="shrink-0">{providers.chatgpt.icon}</span>
        <span className="flex-1">{providers.chatgpt.title}</span>
        <IconExternalLink className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </DropdownMenuItem>
  )
}

export type OpenInClaudeProps = ComponentProps<typeof DropdownMenuItem>

export const OpenInClaude = (props: OpenInClaudeProps) => {
  const { query } = useOpenInContext()
  return (
    <DropdownMenuItem asChild {...props}>
      <Link
        className="flex items-center gap-2"
        external
        href={providers.claude.createUrl(query)}
      >
        <span className="shrink-0">{providers.claude.icon}</span>
        <span className="flex-1">{providers.claude.title}</span>
        <IconExternalLink className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </DropdownMenuItem>
  )
}

export type OpenInT3Props = ComponentProps<typeof DropdownMenuItem>

export const OpenInT3 = (props: OpenInT3Props) => {
  const { query } = useOpenInContext()
  return (
    <DropdownMenuItem asChild {...props}>
      <Link
        className="flex items-center gap-2"
        external
        href={providers.t3.createUrl(query)}
      >
        <span className="shrink-0">{providers.t3.icon}</span>
        <span className="flex-1">{providers.t3.title}</span>
        <IconExternalLink className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </DropdownMenuItem>
  )
}

export type OpenInSciraProps = ComponentProps<typeof DropdownMenuItem>

export const OpenInScira = (props: OpenInSciraProps) => {
  const { query } = useOpenInContext()
  return (
    <DropdownMenuItem asChild {...props}>
      <Link
        className="flex items-center gap-2"
        external
        href={providers.scira.createUrl(query)}
      >
        <span className="shrink-0">{providers.scira.icon}</span>
        <span className="flex-1">{providers.scira.title}</span>
        <IconExternalLink className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </DropdownMenuItem>
  )
}

export type OpenInv0Props = ComponentProps<typeof DropdownMenuItem>

export const OpenInv0 = (props: OpenInv0Props) => {
  const { query } = useOpenInContext()
  return (
    <DropdownMenuItem asChild {...props}>
      <Link
        className="flex items-center gap-2"
        external
        href={providers.v0.createUrl(query)}
      >
        <span className="shrink-0">{providers.v0.icon}</span>
        <span className="flex-1">{providers.v0.title}</span>
        <IconExternalLink className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </DropdownMenuItem>
  )
}

export type OpenInCursorProps = ComponentProps<typeof DropdownMenuItem>

export const OpenInCursor = (props: OpenInCursorProps) => {
  const { query } = useOpenInContext()
  return (
    <DropdownMenuItem asChild {...props}>
      <Link
        className="flex items-center gap-2"
        external
        href={providers.cursor.createUrl(query)}
      >
        <span className="shrink-0">{providers.cursor.icon}</span>
        <span className="flex-1">{providers.cursor.title}</span>
        <IconExternalLink className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </DropdownMenuItem>
  )
}
