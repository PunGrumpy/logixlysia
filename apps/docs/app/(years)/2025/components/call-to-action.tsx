'use client'

import { Link } from 'fumadocs-core/framework'
import { Button } from '@/components/ui/button'
import { Section } from './section'

export const Cta = () => (
  <Section>
    <div className="relative z-10 grid gap-12 text-center">
      <div className="grid gap-4">
        <h2 className="font-medium font-serif text-4xl md:text-5xl">
          Ready for 2026?
        </h2>
        <p className="mx-auto max-w-3xl text-lg text-muted-foreground">
          Join us as we continue building the future of logging for Elysia.js.
          Your journey with Logixlysia is just beginning.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-4">
        <Button
          className="px-8"
          nativeButton={false}
          render={<Link href="/" />}
          size="lg"
        >
          Get Started
        </Button>
        <Button
          className="px-8"
          nativeButton={false}
          render={<Link href="/introduction" />}
          size="lg"
          variant="outline"
        >
          View Documentation
        </Button>
      </div>
    </div>
  </Section>
)
