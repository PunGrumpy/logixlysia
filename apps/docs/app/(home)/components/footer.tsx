'use client'

import {
  IconBattery,
  IconBrandGithub,
  IconClock,
  IconHeartFilled
} from '@tabler/icons-react'
import Link from 'fumadocs-core/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

const Actions = [
  {
    icon: IconBattery,
    title: 'Production-ready defaults',
    description: 'Sensible presets + deep configuration when you need it'
  },
  {
    icon: IconBrandGithub,
    title: 'Fully open-source',
    description: 'MIT licensed—use it anywhere and contribute back'
  },
  {
    icon: IconClock,
    title: 'Setup in minutes',
    description: 'Install once, plug in, and get consistent request logs'
  }
]

export const Footer = () => (
  <footer className="grid gap-6 pb-20 sm:pb-28">
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="rounded-3xl p-8 sm:p-10">
        <div className="flex flex-col items-start gap-3">
          <IconHeartFilled className="mt-0.5 size-5 text-pink-500" />
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold text-lg leading-tight">
              Made Possible by You
            </h3>
            <p className="text-muted-foreground text-sm">
              Logixlysia is open-source and community-driven—issues, PRs, and
              feedback keep it sharp
            </p>
          </div>
        </div>
      </Card>

      <Card className="relative isolate overflow-hidden rounded-3xl p-8 sm:p-10">
        <div className="relative z-10 flex flex-col items-center text-center">
          <h3 className="font-semibold font-serif text-3xl tracking-widest sm:text-4xl">
            Log your <span className="italic">Elysia.js</span>
          </h3>
          <p className="mt-3 max-w-sm text-muted-foreground text-sm">
            readable, consistent, and production-ready logs
          </p>
        </div>

        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-x-0 top-20 h-24 bg-linear-to-b from-transparent via-background/30 to-background/70" />
          <div className="absolute -bottom-72 left-1/2 size-144 -translate-x-1/2 rounded-full bg-vesper-orange/55 blur-2xl" />
          <div className="absolute inset-x-0 bottom-0 h-48 bg-linear-to-t from-background/90 to-transparent" />
        </div>
      </Card>
    </div>

    <Card className="rounded-3xl p-8 sm:p-10">
      <div className="flex flex-col gap-8">
        <div className="grid gap-5">
          {Actions.map(action => (
            <div className="flex items-start gap-3" key={action.title}>
              <action.icon className="mt-0.5 size-5 text-muted-foreground" />
              <div className="grid gap-0.5">
                <p className="font-medium">{action.title}</p>
                <p className="text-muted-foreground text-sm">
                  {action.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            className="rounded-full px-6"
            nativeButton={false}
            render={<Link href="/introduction" />}
            size="lg"
          >
            Read docs
          </Button>
          <Button
            className="rounded-full px-6"
            nativeButton={false}
            render={
              <Link external href="https://github.com/PunGrumpy/logixlysia" />
            }
            size="lg"
            variant="outline"
          >
            Open GitHub
          </Button>
        </div>
      </div>
    </Card>
  </footer>
)
