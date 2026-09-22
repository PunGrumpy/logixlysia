import type { CSSProperties, ReactNode } from 'react'
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig
} from 'remotion'
import { paper, paperLine, ringDark } from './theme'

const easeOut = Easing.out(Easing.cubic)
const easeInOut = Easing.inOut(Easing.quad)

/** 0..1 progress of `frame` across `[start, end]`, eased and clamped. */
export const progress = (
  frame: number,
  start: number,
  end: number,
  easing: (t: number) => number = easeOut
): number =>
  interpolate(frame, [start, end], [0, 1], {
    easing,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  })

/** Off-white paper with a faint square grid, like the reference's first act. */
export const PaperGrid = ({
  children,
  cell = 60
}: {
  children?: ReactNode
  cell?: number
}) => (
  <AbsoluteFill
    style={{
      backgroundColor: paper,
      backgroundImage: `linear-gradient(${paperLine} 1px, transparent 1px), linear-gradient(90deg, ${paperLine} 1px, transparent 1px)`,
      backgroundSize: `${cell}px ${cell}px`
    }}
  >
    {children}
  </AbsoluteFill>
)

/** Film grain: a static turbulence texture at low opacity. */
export const Grain = ({ opacity = 0.08 }: { opacity?: number }) => (
  <AbsoluteFill
    style={{ mixBlendMode: 'overlay', opacity, pointerEvents: 'none' }}
  >
    <svg height="100%" width="100%">
      <title>grain</title>
      <filter id="grain">
        <feTurbulence
          baseFrequency="0.9"
          numOctaves="2"
          stitchTiles="stitch"
          type="fractalNoise"
        />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect filter="url(#grain)" height="100%" width="100%" />
    </svg>
  </AbsoluteFill>
)

/** Halftone dot overlay; `size` is the dot pitch. */
export const Halftone = ({
  size = 14,
  dot = 4,
  color = 'rgba(255,255,255,0.55)',
  opacity = 1
}: {
  size?: number
  dot?: number
  color?: string
  opacity?: number
}) => (
  <AbsoluteFill
    style={{
      backgroundImage: `radial-gradient(${color} ${dot / 2}px, transparent ${dot / 2 + 0.5}px)`,
      backgroundSize: `${size}px ${size}px`,
      opacity,
      pointerEvents: 'none'
    }}
  />
)

const hash = (a: number, b: number): number => {
  const x = Math.sin(a * 12.9898 + b * 78.233) * 43_758.5453
  return x - Math.floor(x)
}

const cellDistance = (
  nx: number,
  ny: number,
  from: 'bottom-right' | 'top-left' | 'center'
): number => {
  if (from === 'bottom-right') {
    return (2 - nx - ny) / 2
  }
  if (from === 'top-left') {
    return (nx + ny) / 2
  }
  return Math.hypot(nx - 0.5, ny - 0.5) / 0.71
}

/**
 * Pixel-block wipe. `t` 0..1 reveals `children` as a growing cluster of
 * square cells spreading from one corner, matching the reference's transition.
 */
export const BlockWipe = ({
  t,
  children,
  cell = 60,
  from = 'bottom-right',
  id = 'blockwipe'
}: {
  t: number
  children: ReactNode
  cell?: number
  from?: 'bottom-right' | 'top-left' | 'center'
  id?: string
}) => {
  const { width, height } = useVideoConfig()
  if (t <= 0) {
    return null
  }
  const eased = easeInOut(t)
  const cols = Math.ceil(width / cell)
  const rows = Math.ceil(height / cell)
  const rects: { x: number; y: number }[] = []
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const d = cellDistance(c / (cols - 1), r / (rows - 1), from)
      const threshold = d * 0.72 + hash(c, r) * 0.28
      if (eased >= threshold) {
        rects.push({ x: c * cell, y: r * cell })
      }
    }
  }
  if (rects.length === 0) {
    return null
  }
  const full = t >= 1
  return (
    <AbsoluteFill>
      {full ? null : (
        <svg height="0" style={{ position: 'absolute' }} width="0">
          <title>wipe mask</title>
          <defs>
            <mask
              height={height}
              id={id}
              maskUnits="userSpaceOnUse"
              width={width}
              x="0"
              y="0"
            >
              <rect fill="black" height={height} width={width} x="0" y="0" />
              {rects.map(r => (
                <rect
                  fill="white"
                  height={cell + 1}
                  key={`${r.x}-${r.y}`}
                  width={cell + 1}
                  x={r.x}
                  y={r.y}
                />
              ))}
            </mask>
          </defs>
        </svg>
      )}
      <AbsoluteFill
        style={
          full ? undefined : { WebkitMask: `url(#${id})`, mask: `url(#${id})` }
        }
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

/** Frosted glass panel used for chat bubbles, cards and pills. */
export const Glass = ({
  children,
  style,
  radius = 28,
  tint = 'rgba(255,255,255,0.10)'
}: {
  children?: ReactNode
  style?: CSSProperties
  radius?: number
  tint?: string
}) => (
  <div
    style={{
      backdropFilter: 'blur(28px) saturate(1.2)',
      background: tint,
      borderRadius: radius,
      // A shadow ring reads on any backdrop; a solid border only suits one.
      boxShadow: `${ringDark}, 0 20px 60px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.18)`,
      WebkitBackdropFilter: 'blur(28px) saturate(1.2)',
      ...style
    }}
  >
    {children}
  </div>
)

const POP_FADE_FRAMES = 10

/**
 * Eases an element in from `at` (frames): a short fade, a small rise, and a
 * settle from `from` scale with no overshoot, the way the reference's words
 * land on the grid.
 */
export const Pop = ({
  at,
  children,
  style,
  from = 0.96,
  rise = 10
}: {
  at: number
  children: ReactNode
  style?: CSSProperties
  from?: number
  rise?: number
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  if (frame < at) {
    return null
  }
  const settle = spring({
    config: { damping: 200, mass: 0.9, stiffness: 120 },
    fps,
    frame: frame - at
  })
  const opacity = progress(frame, at, at + POP_FADE_FRAMES)
  const scale = from + (1 - from) * settle
  const y = rise * (1 - settle)
  return (
    <div
      style={{
        opacity,
        transform: `translateY(${y}px) scale(${scale})`,
        transformOrigin: 'center',
        ...style
      }}
    >
      {children}
    </div>
  )
}

/** Eased fade-in over `dur` frames starting at `at`. */
export const useFade = (at: number, dur = 12): number => {
  const frame = useCurrentFrame()
  return progress(frame, at, at + dur)
}

/** Eased fade-out over `dur` frames ending at `end`. */
export const useFadeOut = (end: number, dur = 12): number => {
  const frame = useCurrentFrame()
  return 1 - progress(frame, end - dur, end, easeInOut)
}

/** Typewriter: returns the prefix of `text` visible at the current frame. */
export const useTyped = (text: string, at: number, cps = 28): string => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const chars = Math.max(0, Math.floor(((frame - at) / fps) * cps))
  return text.slice(0, Math.min(text.length, chars))
}
