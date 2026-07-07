'use client'

import { IconCheck, IconCopy } from '@tabler/icons-react'
import { useCopyButton } from 'fumadocs-ui/utils/use-copy-button'
import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import { useRef } from 'react'

export const copyIconAnimation = {
  initial: { opacity: 0, scale: 0.25, filter: 'blur(4px)' },
  animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
  exit: { opacity: 0, scale: 0.25, filter: 'blur(4px)' },
  transition: { type: 'spring' as const, duration: 0.3, bounce: 0 }
}

export const CopyIcons = ({ checked }: { checked: boolean }) => (
  <AnimatePresence initial={false} mode="popLayout">
    {checked ? (
      <motion.span
        {...copyIconAnimation}
        className="absolute inset-0 flex items-center justify-center text-emerald-500 dark:text-emerald-400"
        key="check"
      >
        <IconCheck className="size-full" />
      </motion.span>
    ) : (
      <motion.span
        {...copyIconAnimation}
        className="absolute inset-0 flex items-center justify-center"
        key="copy"
      >
        <IconCopy className="size-full" />
      </motion.span>
    )}
  </AnimatePresence>
)

export const AnimatedCopyButton = (props: { className?: string }) => {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [checked, onClick] = useCopyButton(() => {
    const button = buttonRef.current
    if (!button) {
      return
    }
    const figure = button.closest('figure')
    const pre = figure?.querySelector('pre')
    if (!pre) {
      return
    }

    const clone = pre.cloneNode(true) as HTMLElement
    for (const node of clone.querySelectorAll('.nd-copy-ignore')) {
      node.replaceWith('\n')
    }
    navigator.clipboard.writeText(clone.textContent ?? '')
  })

  return (
    <button
      aria-label={checked ? 'Copied' : 'Copy code'}
      className="relative inline-flex size-7 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onClick}
      ref={buttonRef}
      type="button"
      {...props}
    >
      <div className="relative size-4">
        <CopyIcons checked={checked} />
      </div>
    </button>
  )
}

export const CodeBlockCopyActions = ({
  className,
  children
}: {
  className?: string
  children?: ReactNode
}) => {
  if (!children) {
    return null
  }

  return (
    <div className={className}>
      <AnimatedCopyButton />
    </div>
  )
}
