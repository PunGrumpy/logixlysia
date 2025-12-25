'use client'

import { useEffect, useRef, useState } from 'react'
import Marquee, { type MarqueeProps } from 'react-fast-marquee'

export const MarqueeProvider = (props: MarqueeProps) => {
  const ref = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState<{
    width?: number
    height?: number
  }>({})

  useEffect(() => {
    const updateDimensions = () => {
      if (ref.current) {
        setDimensions({
          width: ref.current.clientWidth,
          height: ref.current.clientHeight
        })
      }
    }

    updateDimensions()

    // Create ResizeObserver to watch for size changes
    const observer = new ResizeObserver(updateDimensions)
    if (ref.current) {
      observer.observe(ref.current)
    }

    return () => {
      if (ref.current) {
        observer.unobserve(ref.current)
      }
    }
  }, [])

  const style =
    props.direction === 'up' || props.direction === 'down'
      ? { height: dimensions.height, width: dimensions.width }
      : { width: dimensions.width }

  return (
    <div className="h-full w-full" ref={ref}>
      <Marquee {...props} style={style} />
    </div>
  )
}
