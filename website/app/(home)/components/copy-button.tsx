'use client'

import { CheckIcon, CopyIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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
      aria-label="Copy to clipboard"
      className={cn('-m-2 shrink-0', className)}
      disabled={copied}
      id={name}
      onClick={handleCopy}
      size="icon"
      variant="ghost"
    >
      <Icon className="text-muted-foreground" size={16} />
    </Button>
  )
}
