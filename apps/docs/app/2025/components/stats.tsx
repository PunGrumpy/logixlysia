'use client'

import {
  IconBrandGithub,
  IconCalendar,
  IconCode,
  IconGitBranch,
  IconGitCommit
} from '@tabler/icons-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { Icons } from '@/components/icons'
import { Card } from '@/components/ui/card'
import { Section } from './section'

interface StatCardProps {
  title: string
  value: string | number
  description?: string
  icon?: ReactNode
  delay?: number
}

const StatCard = ({
  title,
  value,
  description,
  icon,
  delay = 0
}: StatCardProps) => (
  <motion.div
    initial={{ opacity: 0, y: 32 }}
    transition={{ duration: 0.7, delay: delay / 1000 }}
    viewport={{ once: true, amount: 0.1 }}
    whileInView={{ opacity: 1, y: 0 }}
  >
    <Card className="group relative overflow-hidden bg-card/50 p-8 backdrop-blur-sm">
      <div className="absolute inset-0 bg-linear-to-br from-primary/5 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      <div className="relative z-10">
        {icon && <div className="mb-4 text-primary">{icon}</div>}
        <div className="mb-2 font-medium text-muted-foreground text-sm">
          {title}
        </div>
        <div className="mb-2 font-bold font-serif text-4xl text-foreground md:text-5xl">
          {value}
        </div>
        {description && (
          <div className="text-muted-foreground text-sm">{description}</div>
        )}
      </div>
    </Card>
  </motion.div>
)

export const Stats = () => (
  <Section>
    <div className="grid gap-16">
      <div className="text-center">
        <h2 className="mb-4 font-medium font-serif text-4xl md:text-5xl">
          By The Numbers
        </h2>
        <p className="text-muted-foreground">The metrics that tell our story</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <StatCard
          delay={0}
          description="Total commits since launch"
          icon={<IconGitCommit className="size-8" />}
          title="Commits"
          value="734"
        />
        <StatCard
          delay={100}
          description="Latest version released"
          icon={<Icons.logo className="size-8" />}
          title="Version"
          value="6.0.1"
        />
        <StatCard
          delay={200}
          description="Years of development"
          icon={<IconCalendar className="size-8" />}
          title="Project Age"
          value="2+"
        />
        <StatCard
          delay={300}
          description="Major releases in 2025"
          icon={<IconGitBranch className="size-8" />}
          title="Releases"
          value="6"
        />
        <StatCard
          delay={400}
          description="Features and improvements"
          icon={<IconCode className="size-8" />}
          title="Updates"
          value="50+"
        />
        <StatCard
          delay={500}
          description="Open source on GitHub"
          icon={<IconBrandGithub className="size-8" />}
          title="GitHub"
          value="Active"
        />
      </div>
    </div>
  </Section>
)
