'use client'

import { useOpenPanel } from '@openpanel/nextjs'
import { useCopyButton } from 'fumadocs-ui/utils/use-copy-button'
import { CopyIcons } from '@/components/copy-button'
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

  return (
    <Button
      className="cursor-pointer gap-2 shadow-none"
      onClick={onClick}
      variant="outline"
    >
      <div className="relative size-4">
        <CopyIcons checked={checked} />
      </div>
      Copy Markdown
    </Button>
  )
}
