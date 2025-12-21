import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google'
import { cn } from './utils'

const sans = Geist({
  adjustFontFallback: true,
  display: 'swap',
  fallback: ['ui-sans-serif', 'system-ui'],
  preload: true,
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700']
})

const mono = Geist_Mono({
  adjustFontFallback: true,
  display: 'swap',
  fallback: ['ui-monospace', 'monospace'],
  preload: true,
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600']
})

const serif = Instrument_Serif({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
  weight: '400'
})

export const fonts = cn(
  'touch-manipulation antialiased',
  sans.variable,
  mono.variable,
  serif.variable
)
