import type { Metadata } from 'next'
import { createMetadata } from '@/lib/metadata'
import { Comparison } from './components/comparison'
import { CallToAction } from './components/cta'
import { Demo } from './components/demo'
import { Footer } from './components/footer'
import { Hero } from './components/hero'
import { Playground } from './components/playground'

export const metadata: Metadata = createMetadata(
  'The logger for Elysia.js | Logixlysia',
  'Logixlysia is a logger for Elysia.js, a web framework for Deno. It provides a simple and easy-to-use interface for logging messages in your Elysia.js framework.'
)

const HomePage = () => (
  <>
    <div className="grid gap-8 pt-8 sm:pt-20 md:grid-cols-[1.5fr_2fr] md:gap-0">
      <Hero />
      <Demo />
    </div>
    <Playground />
    <Comparison />
    <CallToAction />
    <Footer />
  </>
)

export default HomePage
