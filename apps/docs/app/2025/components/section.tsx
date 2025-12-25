import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface SectionProps {
  children: ReactNode
  className?: string
}

export const Section = ({ children, className }: SectionProps) => (
  <section className={cn('container relative mx-auto px-4 md:px-8', className)}>
    {children}
  </section>
)
