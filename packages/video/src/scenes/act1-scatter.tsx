import { AbsoluteFill, useCurrentFrame } from 'remotion'
import { ink, mono, sans, sec } from '../lib/theme'
import { BlockWipe, Grain, Halftone, PaperGrid, Pop, progress } from '../lib/ui'

/**
 * Act 1: kinetic words on paper. Each word settles into its own grid cell,
 * one per beat, while log-line chips and small objects drift around them,
 * the way the reference floats emoji and product shots between words.
 */

interface Word {
  at: number
  size?: number
  text: string
  x: number
  y: number
}

const CELL = 60
const WORD_SIZE = 64
const CLOSER_SIZE = 88
const WIPE_SECONDS = 1.1
const DRIFT_PX = 0.12

// Positions are in grid cells (x, y), timing in seconds.
const WORDS: Word[] = [
  { at: 0.35, text: 'One', x: 3, y: 4 },
  { at: 0.6, text: 'request', x: 6, y: 5 },
  { at: 0.85, text: 'hits', x: 11, y: 4 },
  { at: 1.05, text: 'your', x: 14, y: 6 },
  { at: 1.25, text: 'API.', x: 18, y: 5 },
  { at: 2.2, text: 'Ten', x: 4, y: 10 },
  { at: 2.4, text: 'log', x: 8, y: 11 },
  { at: 2.6, text: 'lines', x: 11, y: 10 },
  { at: 2.8, text: 'come', x: 16, y: 12 },
  { at: 3.0, text: 'out.', x: 21, y: 11 },
  { at: 4.4, size: CLOSER_SIZE, text: 'Which', x: 5, y: 14 },
  { at: 4.6, size: CLOSER_SIZE, text: 'one', x: 12, y: 15 },
  { at: 4.8, size: CLOSER_SIZE, text: 'failed?', x: 17, y: 14 }
]

interface Chip {
  at: number
  rot: number
  text: string
  x: number
  y: number
}

const CHIPS: Chip[] = [
  { at: 0.9, rot: -3, text: 'Request received', x: 24, y: 3 },
  { at: 1.5, rot: 2, text: 'User: 8213', x: 26, y: 8 },
  { at: 1.9, rot: 4, text: 'Cart loaded', x: 1, y: 8 },
  { at: 2.5, rot: -2, text: 'Validating…', x: 23, y: 13 },
  { at: 3.1, rot: -5, text: 'Charging card', x: 2, y: 12 },
  { at: 3.6, rot: 3, text: 'Something went wrong', x: 12, y: 2 },
  { at: 4.0, rot: 5, text: 'Retrying', x: 27, y: 16 },
  { at: 4.3, rot: -4, text: 'Done', x: 8, y: 17 }
]

interface Obj {
  at: number
  emoji: string
  x: number
  y: number
}

const OBJECTS: Obj[] = [
  { at: 1.7, emoji: '🛒', x: 9, y: 8 },
  { at: 2.3, emoji: '💳', x: 20, y: 8 },
  { at: 3.3, emoji: '🧾', x: 15, y: 3 },
  { at: 3.9, emoji: '🔍', x: 25, y: 11 },
  { at: 4.1, emoji: '🕒', x: 4, y: 2 }
]

const WordEl = ({ w }: { w: Word }) => (
  <Pop
    at={sec(w.at)}
    style={{ left: w.x * CELL, position: 'absolute', top: w.y * CELL }}
  >
    <span
      style={{
        color: ink,
        fontFamily: sans,
        fontSize: w.size ?? WORD_SIZE,
        fontWeight: 450,
        letterSpacing: -1
      }}
    >
      {w.text}
    </span>
  </Pop>
)

const ChipEl = ({ c }: { c: Chip }) => {
  const frame = useCurrentFrame()
  const drift = Math.sin((frame + c.x * 7) / 22) * 4
  return (
    <Pop
      at={sec(c.at)}
      from={0.9}
      rise={16}
      style={{ left: c.x * CELL, position: 'absolute', top: c.y * CELL }}
    >
      <div
        style={{
          background: '#e6e5df',
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
          color: 'rgba(17,17,17,0.72)',
          fontFamily: mono,
          fontSize: 17,
          padding: '10px 14px',
          transform: `rotate(${c.rot}deg) translateY(${drift}px)`
        }}
      >
        {c.text}
      </div>
    </Pop>
  )
}

const ObjEl = ({ o }: { o: Obj }) => {
  const frame = useCurrentFrame()
  const drift = Math.sin((frame + o.y * 9) / 26) * 5
  return (
    <Pop
      at={sec(o.at)}
      from={0.85}
      rise={16}
      style={{ left: o.x * CELL, position: 'absolute', top: o.y * CELL }}
    >
      <div
        style={{
          background: '#e6e5df',
          boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
          display: 'grid',
          fontSize: 54,
          height: 92,
          placeItems: 'center',
          transform: `translateY(${drift}px)`,
          width: 92
        }}
      >
        {o.emoji}
      </div>
    </Pop>
  )
}

/** The field the wipe reveals and Act 2 opens on: a blue-green halftone. */
export const NoiseField = () => (
  <AbsoluteFill
    style={{
      background:
        'radial-gradient(120% 90% at 20% 20%, #5aa9d6 0%, #3d86b3 35%, #2f6c74 65%, #6f7a3a 100%)'
    }}
  >
    <Halftone color="rgba(255,255,255,0.42)" dot={5} size={13} />
    <Halftone color="rgba(0,0,0,0.18)" dot={9} opacity={0.6} size={26} />
  </AbsoluteFill>
)

export const Act1Scatter = ({ wipeEnd }: { wipeEnd: number }) => {
  const frame = useCurrentFrame()
  const wipe = progress(frame, wipeEnd - sec(WIPE_SECONDS), wipeEnd, t => t)
  // A slow push-in keeps the paper alive between word beats.
  const zoom = 1 + progress(frame, 0, wipeEnd, t => t) * 0.035
  const pan = frame * DRIFT_PX
  return (
    <PaperGrid cell={CELL}>
      <AbsoluteFill
        style={{
          transform: `translate(${-pan}px, ${-pan * 0.6}px) scale(${zoom})`,
          transformOrigin: '50% 40%'
        }}
      >
        {OBJECTS.map(o => (
          <ObjEl key={o.emoji} o={o} />
        ))}
        {CHIPS.map(c => (
          <ChipEl c={c} key={c.text} />
        ))}
        {WORDS.map(w => (
          <WordEl key={`${w.text}-${w.at}`} w={w} />
        ))}
      </AbsoluteFill>
      <Grain opacity={0.05} />
      <BlockWipe from="bottom-right" id="wipe1" t={wipe}>
        <NoiseField />
      </BlockWipe>
    </PaperGrid>
  )
}
