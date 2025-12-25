'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Section } from './section'

interface Milestone {
  month: string
  title: string
  description: string
}

const milestones: Milestone[] = [
  {
    month: 'April',
    title: 'Documentation Website Launch',
    description:
      'Launched the new documentation website with Fumadocs, featuring interactive examples and comprehensive guides'
  },
  {
    month: 'May',
    title: 'Major Version 5.0',
    description:
      'Released v5.0.0 with custom logger support, giving developers more flexibility in logging configuration'
  },
  {
    month: 'June',
    title: 'Enhanced Logging Features',
    description:
      'Added custom log methods and context support in v5.1.0, along with comprehensive test coverage'
  },
  {
    month: 'October',
    title: 'Log Rotation Enhancements',
    description:
      'Implemented complete log rotation with interval support and enhanced compression handling in v5.3.0'
  },
  {
    month: 'December',
    title: 'Version 6.0 Release',
    description:
      'Major update with breaking changes, setting the foundation for future improvements and features'
  }
]

const MilestoneItem = ({
  milestone,
  index,
  isVisible
}: {
  milestone: Milestone
  index: number
  isVisible: boolean
}) => (
  <div
    className={cn(
      'grid grid-cols-[auto_1fr] items-start gap-6 transition-all duration-700 md:gap-8',
      isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
    )}
    style={{ transitionDelay: `${index * 100}ms` }}
  >
    {/* Timeline dot */}
    <div className="relative z-10 grid grid-rows-[auto_1fr] items-start">
      <div className="relative">
        {index === milestones.length - 1 && (
          <div className="absolute inset-0 -m-2 animate-ping rounded-full bg-primary opacity-75" />
        )}
        <div
          className={cn(
            'size-2.5 rounded-full bg-primary',
            index === milestones.length - 1 &&
              'animate-pulse shadow-[0_0_12px_rgba(var(--primary),0.8)] ring-2 ring-primary/40'
          )}
        />
      </div>
      {index < milestones.length - 1 && (
        <div className="h-full w-px bg-border" />
      )}
    </div>

    {/* Content card */}
    <div className="grid min-w-0 gap-2">
      <div className="font-medium text-primary text-xs uppercase tracking-wider">
        {milestone.month} 2025
      </div>
      <h3 className="font-medium font-serif text-foreground text-xl md:text-2xl">
        {milestone.title}
      </h3>
      <p className="text-muted-foreground text-sm leading-relaxed md:text-base">
        {milestone.description}
      </p>
    </div>
  </div>
)

export const Journey = () => {
  const [isVisible, setIsVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true)
        }
      },
      { threshold: 0.1 }
    )

    if (ref.current) {
      observer.observe(ref.current)
    }

    return () => {
      observer.disconnect()
    }
  }, [])

  return (
    <Section className="grid gap-12 md:gap-16">
      <div className="grid gap-4 text-center">
        <h2 className="font-medium font-serif text-3xl text-foreground md:text-5xl">
          The Journey
        </h2>
        <p className="text-muted-foreground text-sm md:text-base">
          Key milestones from 2025
        </p>
      </div>
      <div className="mx-auto max-w-2xl" ref={ref}>
        <div className="grid gap-12 md:gap-16">
          {milestones.map((milestone, index) => (
            <MilestoneItem
              index={index}
              isVisible={isVisible}
              key={milestone.month}
              milestone={milestone}
            />
          ))}
        </div>
      </div>
    </Section>
  )
}
