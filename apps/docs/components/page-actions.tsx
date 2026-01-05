'use client'

import {
  IconBrandGithub,
  IconChevronDown,
  IconExternalLink
} from '@tabler/icons-react'
import Link from 'fumadocs-core/link'
import {
  OpenIn,
  OpenInChatGPT,
  OpenInClaude,
  OpenInContent,
  OpenInCursor,
  OpenInItem,
  OpenInScira,
  OpenInSeparator,
  OpenInT3,
  OpenInTrigger,
  OpenInv0
} from '@/components/ai-elements/open-in-chat'
import { Button } from './ui/button'

interface ViewOptionsProps {
  markdownUrl: string
  githubUrl: string
}

export const ViewOptions = ({ markdownUrl, githubUrl }: ViewOptionsProps) => {
  const fullMarkdownUrl =
    typeof window === 'undefined'
      ? markdownUrl
      : new URL(markdownUrl, window.location.origin)
  const query = `Read ${fullMarkdownUrl}, I want to ask questions about it.`

  return (
    <OpenIn query={query}>
      <OpenInTrigger>
        <Button className="shadow-none" variant="outline">
          Open
          <IconChevronDown className="size-4 text-muted-foreground" />
        </Button>
      </OpenInTrigger>
      <OpenInContent>
        <OpenInChatGPT />
        <OpenInClaude />
        <OpenInT3 />
        <OpenInScira />
        <OpenInv0 />
        <OpenInCursor />
        <OpenInSeparator />
        <OpenInItem asChild>
          <Link external href={githubUrl}>
            <IconBrandGithub className="size-4" />
            <span className="flex-1">Open in GitHub</span>
            <IconExternalLink className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </OpenInItem>
      </OpenInContent>
    </OpenIn>
  )
}
