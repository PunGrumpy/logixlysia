import { layout } from '@/lib/layout'
import { DocsLayout } from 'fumadocs-ui/layouts/notebook'
import type { ReactNode } from 'react'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  return (
    <DocsLayout
      {...layout}
      sidebar={{
        hidden: true,
        collapsible: false
      }}
      tabMode="sidebar"
    >
      <main
        className="w-full"
        style={{
          paddingTop: 'var(--fd-nav-height)'
        }}
      >
        {children}
      </main>
    </DocsLayout>
  )
}
