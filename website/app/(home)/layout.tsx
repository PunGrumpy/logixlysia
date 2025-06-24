import { DocsLayout } from 'fumadocs-ui/layouts/notebook'
import type { ReactNode } from 'react'
import { layout } from '@/lib/layout'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  return (
    <DocsLayout
      {...layout}
      containerProps={{
        className: 'md:[&_[id=nd-sidebar]]:hidden max-h-screen'
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
