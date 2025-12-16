import { Link } from 'fumadocs-core/framework'
import { Installer } from '@/components/installer'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const Hero = () => (
  <section className="flex flex-col justify-between gap-8">
    <div className="flex flex-col gap-4">
      <h1
        className={cn(
          'flex flex-col',
          'text-balance font-medium font-serif text-4xl leading-none md:text-6xl',
          'bg-linear-to-b from-foreground to-tertiary bg-clip-text text-transparent'
        )}
      >
        The logger for Elysia.js,{' '}
        <span className="italic">simple and easy to use</span> beautiful and
        powerful
      </h1>

      <p className="max-w-lg text-balance font-light text-muted-foreground">
        Logixlysia is a logger for{' '}
        <Link
          className="underline"
          href="https://elysiajs.com/"
          rel="noopener"
          target="_blank"
        >
          Elysia.js
        </Link>
        , a web framework for Bun. It provides a simple and easy-to-use
        interface and powerful features for logging and debugging.
      </p>
    </div>

    <div className="flex h-fit max-w-md flex-row items-center gap-4">
      <Installer code="bun add logixlysia" />
      <Button className="px-4" size="lg" variant="link">
        <Link href="/docs">Read the docs</Link>
      </Button>
    </div>
  </section>
)
