import { CopyButton } from './copy-button'

interface SnippetProps {
  code: string
}

export const Installer = ({ code }: SnippetProps) => (
  <div className="flex items-center gap-2 rounded-md border bg-muted/5 py-[9px] pr-[9px] pl-4 backdrop-blur-lg dark:bg-muted-foreground/5">
    <pre className="text-sm">{code}</pre>
    <CopyButton
      className="ml-0 rounded-sm hover:bg-accent/15 dark:hover:bg-accent-foreground/15"
      code={code}
      name="Installer"
    />
  </div>
)
