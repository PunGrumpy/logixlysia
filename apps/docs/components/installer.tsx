'use client'

import { IconCheck, IconCopy } from '@tabler/icons-react'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText
} from '@/components/ui/input-group'

const COPY_TIMEOUT = 2000

interface InstallerProps {
  code: string
}

export const Installer = ({ code }: InstallerProps) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    toast.success('Copied to clipboard')
    setCopied(true)

    setTimeout(() => {
      setCopied(false)
    }, COPY_TIMEOUT)
  }

  const Icon = copied ? IconCheck : IconCopy

  return (
    <InputGroup className="h-10 rounded-md bg-card font-mono shadow-none">
      <InputGroupAddon>
        <InputGroupText className="font-normal text-muted-foreground">
          🦊~
        </InputGroupText>
      </InputGroupAddon>
      <InputGroupInput readOnly value={code} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          aria-label="Copy"
          className="rounded-sm"
          onClick={handleCopy}
          size="icon-sm"
          title="Copy"
        >
          <Icon className="size-3.5" size={14} />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}
