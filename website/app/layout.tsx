import { Toaster } from '@/components/ui/sonner'
import './globals.css'

import { cn } from '@/lib/utils'
import { RootProvider } from 'fumadocs-ui/provider'
import { Geist, Geist_Mono } from 'next/font/google'
import type { ReactNode } from 'react'

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
    <html lang="en" suppressHydrationWarning className="scroll-smooth">
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
