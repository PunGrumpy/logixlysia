import type { Metadata } from 'next'
import { createMetadata } from '@/lib/metadata'
import { Cta } from './components/call-to-action'
import { Features } from './components/features'
import { Hero } from './components/hero'
import { Journey } from './components/journey'
import { Stats } from './components/stats'

export const metadata: Metadata = createMetadata(
  '2025 Wrapped | Logixlysia',
  "A celebration of everything we built together in 2025. From the first commit to the latest feature, here's your journey with Logixlysia."
)

const Wrapped2025Page = () => (
  <>
    <Hero />
    <Stats />
    <Journey />
    <Features />
    <Cta />
  </>
)

export default Wrapped2025Page
