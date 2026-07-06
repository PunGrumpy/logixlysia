'use client'

import { useOpenPanel } from '@openpanel/nextjs'
import { IconCheck, IconCopy } from '@tabler/icons-react'
import { useCopyButton } from 'fumadocs-ui/utils/use-copy-button'
import { AnimatePresence, motion } from 'motion/react'
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
      <div className="relative flex size-4 items-center justify-center">
        <AnimatePresence initial={false} mode="popLayout">
          {checked ? (
            <motion.span
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              className="absolute inline-flex shrink-0 text-emerald-500 dark:text-emerald-400"
              exit={{ opacity: 0, scale: 0.25, filter: 'blur(4px)' }}
              initial={{ opacity: 0, scale: 0.25, filter: 'blur(4px)' }}
              key="check"
              transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
            >
              <IconCheck className="size-4" />
            </motion.span>
          ) : (
            <motion.span
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              className="absolute inline-flex shrink-0"
              exit={{ opacity: 0, scale: 0.25, filter: 'blur(4px)' }}
              initial={{ opacity: 0, scale: 0.25, filter: 'blur(4px)' }}
              key="copy"
              transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
            >
              <IconCopy className="size-4" />
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      Copy Markdown
    </Button>
  )
}
