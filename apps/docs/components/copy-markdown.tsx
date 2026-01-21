'use client'

import { useOpenPanel } from '@openpanel/nextjs'
import { IconCheck, IconCopy } from '@tabler/icons-react'
import { useCopyButton } from 'fumadocs-ui/utils/use-copy-button'
import { Button } from './ui/button'

interface CopyMarkdownProps {
  markdown: string
}

export const CopyMarkdown = ({ markdown }: CopyMarkdownProps) => {
  const { track } = useOpenPanel()

  const [checked, onClick] = useCopyButton(() => {
    track('copy_to_clipboard', {
      markdown,
      name: 'copy-markdown'
    })
    navigator.clipboard.writeText(markdown)
  })

  const Icon = checked ? IconCheck : IconCopy

  return (
    <Button
      className="cursor-pointer shadow-none"
      onClick={onClick}
      variant="outline"
    >
      <Icon className="size-4" />
      Copy Markdown
    </Button>
  )
}
