import './globals.css'

import { cn } from '@/lib/utils'
import { RootProvider } from 'fumadocs-ui/provider'
import { Geist, Geist_Mono, Inter } from 'next/font/google'
import type { ReactNode } from 'react'
import { Toaster } from 'sonner'

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

export default function Layout({ children }: { children: ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning className="scroll-smooth">
			<body
				className={cn(
					'font-sans antialiased flex min-h-screen',
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
