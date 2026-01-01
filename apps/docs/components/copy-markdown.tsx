'use client'

import { track } from '@databuddy/sdk/react'
import { IconCheck, IconCopy } from '@tabler/icons-react'
import { useCopyButton } from 'fumadocs-ui/utils/use-copy-button'
import { toast } from 'sonner'
import { Button } from './ui/button'

interface CopyMarkdownProps {
  markdown: string
}

export const CopyMarkdown = ({ markdown }: CopyMarkdownProps) => {
  const [checked, onClick] = useCopyButton(() => {
    try {
      navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': markdown
        })
      ])
      track('copy_to_clipboard', { markdown, name: 'copy-markdown' })
    } catch (error) {
      toast.error('Failed to copy markdown', {
        description: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  const Icon = checked ? IconCheck : IconCopy

  return (
    <Button
      className="cursor-pointer shadow-none"
      onClick={onClick}
      render={
        <span>
          <Icon className="size-4" />
          Copy Markdown
        </span>
      }
      variant="outline"
    />
  )
}
