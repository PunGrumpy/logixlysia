'use client'

import { Streamdown } from 'streamdown'

interface ReleaseMarkdownProps {
  readonly children: string
}

export const ReleaseMarkdown = ({ children }: ReleaseMarkdownProps) => (
  <div className="rounded bg-muted/50 p-4 text-sm">
    <Streamdown className="prose prose-sm dark:prose-invert max-w-none">
      {children}
    </Streamdown>
  </div>
)
