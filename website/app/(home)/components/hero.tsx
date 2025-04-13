import { Installer } from '@/app/(home)/components/installer'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export const Hero = () => (
  <div className="flex flex-col items-start gap-8">
    <h1 className="text-5xl sm:text-6xl">The logger for Elysia.js</h1>
    <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
      Logixlysia is a logger for Elysia, a web framework for Node.js. It is
      designed to be simple and easy to use, while providing powerful features
      for logging and debugging.
    </p>
    <div className="flex items-center justify-center gap-4">
      <Installer code="bun add logixlysia" />
      <Button asChild variant="link" size="lg" className="px-4">
        <Link href="/docs">Read the docs</Link>
      </Button>
    </div>
  </div>
)
