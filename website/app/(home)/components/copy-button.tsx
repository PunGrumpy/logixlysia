'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CheckIcon, CopyIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

type CopyButtonProps = {
  code: string
  className?: string
  name: string
}

export const CopyButton = ({ code, className, name }: CopyButtonProps) => {
  const [copied, setCopied] = useState(false)
  const Icon = copied ? CheckIcon : CopyIcon

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    toast.success('Copied to clipboard')

    setTimeout(() => {
      setCopied(false)
    }, 2000)
  }

  return (
    <Button
      id={name}
      size="icon"
      className={cn('-m-2 shrink-0', className)}
      variant="ghost"
      onClick={handleCopy}
      disabled={copied}
      aria-label="Copy to clipboard"
    >
      <Icon size={16} className="text-muted-foreground" />
    </Button>
  )
}
