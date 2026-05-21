'use client'

import { Streamdown } from 'streamdown'

interface ReleaseMarkdownProps {
  readonly children: string
}

export const ReleaseMarkdown = ({ children }: ReleaseMarkdownProps) => (
  <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-medium prose-a:text-primary prose-a:decoration-primary/50 prose-a:underline-offset-4 prose-a:transition-colors prose-a:duration-200 prose-a:ease-out hover:prose-a:decoration-primary">
    <Streamdown>{children}</Streamdown>
  </div>
)
