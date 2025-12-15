import { DocsLayout } from 'fumadocs-ui/layouts/notebook'
import type { ReactNode } from 'react'
import { layout } from '@/lib/layout'

export default function Layout({ children }: { children: ReactNode }) {
  return <DocsLayout {...layout}>{children}</DocsLayout>
}
