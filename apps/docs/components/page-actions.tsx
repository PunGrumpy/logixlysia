'use client'

import { ChevronDownIcon, ExternalLinkIcon, GithubIcon } from 'lucide-react'
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

type ViewOptionsProps = {
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
        <Button
          className="shadow-none"
          render={
            <span>
              Open
              <ChevronDownIcon className="size-4 text-muted-foreground" />
            </span>
          }
          variant="outline"
        />
      </OpenInTrigger>
      <OpenInContent>
        <OpenInChatGPT />
        <OpenInClaude />
        <OpenInT3 />
        <OpenInScira />
        <OpenInv0 />
        <OpenInCursor />
        <OpenInSeparator />
        <OpenInItem
          render={
            <a
              className="flex items-center gap-2"
              href={githubUrl}
              rel="noopener"
              target="_blank"
            >
              <GithubIcon />
              <span className="flex-1">Open in GitHub</span>
              <ExternalLinkIcon className="size-4 shrink-0 text-muted-foreground" />
            </a>
          }
        />
      </OpenInContent>
    </OpenIn>
  )
}
