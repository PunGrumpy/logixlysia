import './globals.css'
import 'streamdown/styles.css'
import { RootProvider } from 'fumadocs-ui/provider/next'
import type { ReactNode } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { fonts } from '@/lib/fonts'
import { AnalyticsProvider } from '@/providers/analytics'
import { MotionProvider } from '@/providers/motion'

interface LayoutProps {
  readonly children: ReactNode
}

const Layout = ({ children }: LayoutProps) => (
  <html className={fonts} lang="en" suppressHydrationWarning>
    <body className="flex min-h-screen flex-col">
      <AnalyticsProvider>
        <MotionProvider>
          <RootProvider
            theme={{
              defaultTheme: undefined,
              enableSystem: true
            }}
          >
            <TooltipProvider>{children}</TooltipProvider>
          </RootProvider>
          <Toaster />
        </MotionProvider>
      </AnalyticsProvider>
    </body>
  </html>
)

export default Layout
