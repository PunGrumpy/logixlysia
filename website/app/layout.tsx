import { Toaster } from '@/components/ui/sonner'
import './globals.css'

import { RootProvider } from 'fumadocs-ui/provider'
import { Geist, Geist_Mono } from 'next/font/google'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const geistSans = Geist({
  adjustFontFallback: true,
  display: 'swap',
  fallback: ['ui-sans-serif', 'system-ui'],
  preload: true,
  subsets: ['latin'],
  variable: '--font-sans'
})

const geistMono = Geist_Mono({
  adjustFontFallback: true,
  display: 'swap',
  fallback: ['ui-monospace', 'monospace'],
  preload: true,
  subsets: ['latin'],
  variable: '--font-mono'
})

interface RootLayoutProps {
  children: ReactNode
}

export default function Layout({ children }: RootLayoutProps) {
  return (
    <html className="scroll-smooth" lang="en" suppressHydrationWarning>
      <body
        className={cn(
          'font-sans antialiased',
          geistSans.variable,
          geistMono.variable
        )}
      >
        <RootProvider
          theme={{
            defaultTheme: 'system'
          }}
        >
          {children}
          <Toaster />
        </RootProvider>
      </body>
    </html>
  )
}
