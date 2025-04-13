import { createMetadata } from '@/lib/metadata'
import type { Metadata } from 'next'
import Image from 'next/image'
import { Hero } from './components/hero'
import { Playground } from './components/playground'
import { HeroSnippet } from './components/snippet'
import FoxLogixlysia from './fox-logixlysia.png'

const title = 'Logixlysia | The logger for Elysia.js'
const description =
  'Logixlysia is a logger for Elysia.js, a web framework for Deno. It provides a simple and easy-to-use interface for logging messages in your Elysia.js framework.'

export const metadata: Metadata = createMetadata(title, description)

export default function HomePage() {
  return (
    <div className="grid h-[calc(100dvh-var(--fd-nav-height))] divide-x overflow-hidden md:grid-cols-2">
      <div className="relative flex items-end justify-start p-8 lg:p-16">
        <Image
          src={FoxLogixlysia}
          alt="Fox - Logixlysia"
          className="-z-10 absolute inset-0 size-full object-cover opacity-30 dark:opacity-15"
        />
        <Hero />
      </div>
      <div className="hidden grid-rows-2 divide-y overflow-hidden md:grid">
        <div className="grid overflow-auto">
          <HeroSnippet />
        </div>
        <Playground />
      </div>
    </div>
  )
}
