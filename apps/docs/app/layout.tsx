import './globals.css'
import { RootProvider } from 'fumadocs-ui/provider/next'
import type { ReactNode } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { fonts } from '@/lib/fonts'
import { AnalyticsProvider } from '@/providers/analytics'

interface LayoutProps {
  readonly children: ReactNode
}

const Layout = ({ children }: LayoutProps) => (
  <html className={fonts} lang="en" suppressHydrationWarning>
    <body className="flex min-h-screen flex-col">
      <AnalyticsProvider>
        <RootProvider
          theme={{
            defaultTheme: undefined,
            enableSystem: true
          }}
        >
          {children}
        </RootProvider>
        <Toaster />
      </AnalyticsProvider>
    </body>
  </html>
)

export default Layout
