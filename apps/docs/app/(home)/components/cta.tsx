import { Installer } from '@/components/installer'

export const CallToAction = () => (
  <div className="grid items-center gap-8 sm:p-16 md:p-24">
    <div className="flex flex-col items-center justify-center gap-2 text-center">
      <h2 className="text-balance font-medium font-serif text-3xl md:text-4xl">
        Install with <span className="italic">in line</span>. Log in{' '}
        <span className="italic">few clicks</span>.
      </h2>
      <p className="text-balance text-lg text-muted-foreground">
        Install Logixlysia and start logging your Elysia applications.
      </p>
    </div>
    <div className="mx-auto w-full max-w-xs">
      <Installer code="bun add logixlysia" />
    </div>
  </div>
)
