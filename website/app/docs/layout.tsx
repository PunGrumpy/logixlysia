import { layout } from '@/lib/layout'
import { DocsLayout } from 'fumadocs-ui/layouts/notebook'
import type { ReactNode } from 'react'

export default function Layout({ children }: { children: ReactNode }) {
  return <DocsLayout {...layout}>{children}</DocsLayout>
}
