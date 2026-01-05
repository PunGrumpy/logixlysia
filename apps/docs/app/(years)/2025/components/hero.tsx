'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Section } from './section'

export const Hero = () => {
  const [scrollY, setScrollY] = useState(0)

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <Section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          background: `radial-gradient(circle at 50% ${50 + scrollY * 0.1}%, var(--primary) 0%, transparent 50%)`
        }}
      />

      <div className="relative z-10 mx-auto grid max-w-4xl grid-cols-1 gap-6 text-center">
        <div className="inline-block justify-self-center rounded-full border border-primary/20 bg-primary/10 px-4 py-2 font-medium text-primary text-sm backdrop-blur-sm">
          Logixlysia 2025 Wrapped
        </div>
        <h1 className="text-balance bg-linear-to-b from-foreground via-foreground/90 to-foreground/70 bg-clip-text font-medium font-serif text-6xl text-transparent leading-tight md:text-8xl lg:text-9xl">
          Your Year in
          <br />
          <span className="italic">Code</span>
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground md:text-xl">
          A celebration of our journey in 2025. From major releases to new
          features, here's what we accomplished together with Logixlysia this
          year.
        </p>
        <Button
          className="justify-self-center"
          onClick={() => {
            window.scrollTo({
              behavior: 'smooth',
              top: window.innerHeight
            })
          }}
          size="lg"
          variant="outline"
        >
          Scroll to explore
        </Button>
      </div>
    </Section>
  )
}
