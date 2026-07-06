'use client'

import type React from 'react'
import {
  CommandPromptContent,
  CommandPromptCopy,
  CommandPromptList,
  CommandPromptPrefix,
  CommandPromptRoot,
  CommandPromptSurface,
  CommandPromptTrigger,
  CommandPromptTriggerDivider,
  CommandPromptViewport
} from '@/components/command-prompt'

interface InstallerProps {
  className?: string
}

const COMMAND_FOR_HUMANS = 'bun add logixlysia'
const COMMAND_FOR_AGENTS = 'bunx skills add PunGrumpy/logixlysia'

export const Installer = ({ className }: InstallerProps): React.JSX.Element => (
  <CommandPromptRoot className={className} defaultValue="humans">
    <CommandPromptList>
      <CommandPromptTrigger className="min-w-[90px]" value="humans">
        For humans
      </CommandPromptTrigger>
      <CommandPromptTriggerDivider />
      <CommandPromptTrigger className="min-w-[84px]" value="agents">
        For agents
      </CommandPromptTrigger>
    </CommandPromptList>
    <CommandPromptSurface>
      <CommandPromptPrefix>$</CommandPromptPrefix>
      <CommandPromptViewport>
        <CommandPromptContent copyValue={COMMAND_FOR_HUMANS} value="humans">
          {COMMAND_FOR_HUMANS}
        </CommandPromptContent>
        <CommandPromptContent copyValue={COMMAND_FOR_AGENTS} value="agents">
          {COMMAND_FOR_AGENTS}
        </CommandPromptContent>
      </CommandPromptViewport>
      <CommandPromptCopy />
    </CommandPromptSurface>
  </CommandPromptRoot>
)
