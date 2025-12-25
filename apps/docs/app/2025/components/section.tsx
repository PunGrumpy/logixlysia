import type { HTMLProps } from 'react'
import { cn } from '@/lib/utils'

export const Section = ({
  children,
  className,
  ...props
}: HTMLProps<HTMLDivElement>) => (
  <section
    className={cn('container relative mx-auto px-4 md:px-8', className)}
    {...props}
  >
    {children}
  </section>
)
