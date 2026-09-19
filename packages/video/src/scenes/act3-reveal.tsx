import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig
} from 'remotion'
import { black, fox, level, mono, sans, sec } from '../lib/theme'
import {
  Glass,
  Grain,
  Halftone,
  progress,
  useFade,
  useFadeOut,
  useTyped
} from '../lib/ui'
import { HotField } from './act2-noise'

/**
 * Act 3: the reveal. The hot field collapses into an orb with rings
 * ("Until now." in the reference), the fox appears inside it, and the orb
 * gives way to a blurred stage where one logixlysia access line types out
 * with its context tree: the single line that replaces the ten.
 */

const ORB_SIZE = 360
const ORB_COLLAPSE_AT = sec(0.2)
const TEXT_AT = sec(0.9)
const FOX_AT = sec(3.0)
const STAGE_AT = sec(4.6)
const LINE_AT = STAGE_AT + sec(0.8)
const TREE_AT = LINE_AT + sec(1.0)
const TREE_GAP = sec(0.22)
const LINE_TEXT = 'POST /checkout 402 1.20s'
const METHOD_LEN = 4
const PATH_LEN = 14
const STATUS_LEN = 18
const FOX_BLUR_PX = 4
const FOX_SCALE_FROM = 0.25
const EXIT_RISE_PX = 8
const RING_SCALES = [1.45, 1.95, 2.6]
const RING_GROWTH = 0.000_35
const EXIT_FRAMES = sec(0.5)

const TREE = [
  ['requestId', '9f3c1a…e2'],
  ['userId', 'u_8213'],
  ['cart.total', '99.00'],
  ['error.code', 'PAYMENT_DECLINED'],
  ['error.why', 'The issuing bank rejected the charge.'],
  ['error.fix', 'Try a different card, or contact your bank.']
] as const

const Ring = ({ scale, index }: { scale: number; index: number }) => {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const start = ORB_COLLAPSE_AT + sec(0.6) + index * 6
  const ringIn = spring({
    config: { damping: 200, stiffness: 40 },
    fps,
    frame: frame - start
  })
  // Rings keep expanding slowly after they land, like ripples.
  const growth = 1 + Math.max(0, frame - start) * RING_GROWTH
  const size = ORB_SIZE * scale
  return (
    <div
      style={{
        border: '1px solid rgba(255,255,255,0.35)',
        borderRadius: '50%',
        height: size,
        left: width / 2,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        opacity: ringIn * 0.8,
        position: 'absolute',
        top: height / 2,
        transform: `scale(${(0.7 + 0.3 * ringIn) * growth})`,
        width: size
      }}
    />
  )
}

const Orb = ({ exitAt }: { exitAt: number }) => {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const collapse = spring({
    config: { damping: 200, mass: 1.4, stiffness: 42 },
    fps,
    frame: frame - ORB_COLLAPSE_AT
  })
  const size = interpolate(
    collapse,
    [0, 1],
    [Math.hypot(width, height) * 1.1, ORB_SIZE]
  )
  const foxIn = spring({
    config: { damping: 200, stiffness: 90 },
    fps,
    frame: frame - FOX_AT
  })
  const exit = useFadeOut(exitAt, EXIT_FRAMES)
  const typed = useTyped('Until now.', TEXT_AT, 14)
  const textOut = 1 - progress(frame, FOX_AT - sec(0.3), FOX_AT)
  const glow = progress(
    frame,
    ORB_COLLAPSE_AT + sec(0.4),
    ORB_COLLAPSE_AT + sec(1.4)
  )
  // Act 2 ends on the full-bleed field; hold it while the orb takes over so
  // the two gradients cross-fade instead of cutting.
  const handoff = progress(frame, ORB_COLLAPSE_AT, ORB_COLLAPSE_AT + 12)
  // The field stays opaque until the orb fully covers it, so no frame shows
  // two half-transparent layers over black.
  const fieldOut =
    1 - progress(frame, ORB_COLLAPSE_AT + 12, ORB_COLLAPSE_AT + 18)
  return (
    <AbsoluteFill style={{ opacity: exit }}>
      <AbsoluteFill style={{ opacity: fieldOut }}>
        <HotField />
      </AbsoluteFill>
      {RING_SCALES.map((scale, i) => (
        <Ring index={i} key={scale} scale={scale} />
      ))}
      <div
        style={{
          background:
            'radial-gradient(110% 80% at 70% 30%, #ffb35c 0%, #f26a3d 40%, #c22e2e 75%, #7a1b2e 100%)',
          borderRadius: '50%',
          boxShadow: `0 0 ${80 * glow}px rgba(255,140,80,${0.6 * glow}), 0 0 ${200 * glow}px rgba(242,106,61,${0.35 * glow}), inset ${-30 * glow}px ${-30 * glow}px 80px rgba(120,20,40,${0.6 * glow})`,
          height: size,
          left: width / 2,
          marginLeft: -size / 2,
          marginTop: -size / 2,
          opacity: handoff,
          overflow: 'hidden',
          position: 'absolute',
          top: height / 2,
          width: size
        }}
      >
        <AbsoluteFill
          style={{
            background:
              'radial-gradient(80% 80% at 35% 30%, #fff4d6 0%, #ffb35c 30%, #f26a3d 60%, #c22e2e 100%)',
            opacity: collapse
          }}
        />
        <Halftone
          color="rgba(255,220,180,0.35)"
          dot={6}
          opacity={1 - collapse}
          size={16}
        />
        <Img
          src={staticFile('icon.png')}
          style={{
            filter: `blur(${FOX_BLUR_PX * (1 - foxIn)}px) drop-shadow(0 10px 30px rgba(0,0,0,0.35))`,
            height: 200,
            left: '50%',
            marginLeft: -100,
            marginTop: -100,
            opacity: foxIn,
            position: 'absolute',
            top: '50%',
            transform: `scale(${FOX_SCALE_FROM + (1 - FOX_SCALE_FROM) * foxIn})`,
            width: 200
          }}
        />
      </div>
      <div
        style={{
          color: '#fff',
          fontFamily: sans,
          fontSize: 56,
          fontWeight: 450,
          left: 0,
          opacity: textOut,
          position: 'absolute',
          right: 0,
          textAlign: 'center',
          textShadow: '0 4px 30px rgba(0,0,0,0.35)',
          top: height / 2 - 34
        }}
      >
        {typed}
      </div>
    </AbsoluteFill>
  )
}

const TreeLine = ({ k, v, index }: { k: string; v: string; index: number }) => {
  const frame = useCurrentFrame()
  const at = TREE_AT + index * TREE_GAP
  if (frame < at) {
    return null
  }
  const t = progress(frame, at, at + 8)
  const last = index === TREE.length - 1
  const highlight = k.startsWith('error.')
  return (
    <div style={{ opacity: t, transform: `translateY(${(1 - t) * 6}px)` }}>
      <span style={{ color: 'rgba(255,255,255,0.4)' }}>
        {last ? '  └─ ' : '  ├─ '}
      </span>
      <span style={{ color: highlight ? '#ff9d7a' : '#9fd3ff' }}>
        {k.padEnd(12)}
      </span>
      <span>{v}</span>
    </div>
  )
}

const Stage = ({ exitAt }: { exitAt: number }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const fadeIn = useFade(STAGE_AT - sec(0.2), sec(0.6))
  const fadeOut = useFadeOut(exitAt, EXIT_FRAMES)
  const cardIn = spring({
    config: { damping: 200, stiffness: 70 },
    fps,
    frame: frame - STAGE_AT - sec(0.2)
  })
  const drift = frame / 12
  const line = useTyped(LINE_TEXT, LINE_AT, 30)
  const lineDone = line.length >= LINE_TEXT.length
  const caretOn = Math.round(frame / 8) % 2 === 1
  const captionIn = useFade(TREE_AT + sec(1.6), 14)
  return (
    <AbsoluteFill
      style={{
        opacity: fadeIn * fadeOut,
        transform: `translateY(${-EXIT_RISE_PX * (1 - fadeOut)}px)`
      }}
    >
      <AbsoluteFill
        style={{
          background: `radial-gradient(60% 60% at ${28 + Math.sin(drift / 9) * 3}% 35%, #d9c34a 0%, transparent 60%),
            radial-gradient(55% 60% at ${72 + Math.cos(drift / 11) * 3}% 25%, #8cc7ff 0%, transparent 60%),
            radial-gradient(70% 70% at 55% 80%, #2f8f5a 0%, transparent 65%),
            radial-gradient(50% 50% at 15% 85%, #f2a24b 0%, transparent 60%),
            #17351f`,
          filter: 'blur(28px) saturate(1.1)',
          transform: 'scale(1.12)'
        }}
      />
      <Grain opacity={0.12} />
      <div
        style={{
          left: 360,
          opacity: cardIn,
          position: 'absolute',
          top: 250,
          transform: `translateY(${(1 - cardIn) * 40}px)`,
          width: 1200
        }}
      >
        <div
          style={{
            color: 'rgba(255,255,255,0.6)',
            fontFamily: sans,
            fontSize: 18,
            marginBottom: 10,
            marginLeft: 8
          }}
        >
          logixlysia
        </div>
        <Glass
          radius={24}
          style={{ padding: '30px 36px' }}
          tint="rgba(10,25,15,0.35)"
        >
          <div
            style={{
              color: '#fff',
              fontFamily: mono,
              fontSize: 26,
              fontVariantNumeric: 'tabular-nums',
              lineHeight: '42px',
              whiteSpace: 'pre'
            }}
          >
            <span style={{ color: 'rgba(255,255,255,0.45)' }}>14:25:34 </span>
            <span style={{ color: 'rgba(255,255,255,0.6)' }}>[shop] </span>
            <span
              style={{
                background: level.warning,
                borderRadius: 6,
                color: '#111',
                padding: '2px 6px'
              }}
            >
              🦊
            </span>
            <span> </span>
            <span style={{ color: level.debug, fontWeight: 700 }}>
              {line.slice(0, METHOD_LEN)}
            </span>
            <span>{line.slice(METHOD_LEN, PATH_LEN)}</span>
            <span style={{ color: level.warning }}>
              {line.slice(PATH_LEN, STATUS_LEN)}
            </span>
            <span style={{ color: level.error, fontWeight: 700 }}>
              {line.slice(STATUS_LEN)}
            </span>
            {lineDone ? (
              <span style={{ color: 'rgba(255,255,255,0.75)' }}>
                {' '}
                Card declined
                <span style={{ color: level.warning }}> ⚡ slow</span>
              </span>
            ) : (
              <span style={{ color: fox, opacity: caretOn ? 1 : 0 }}>▍</span>
            )}
          </div>
          <div
            style={{
              color: 'rgba(255,255,255,0.85)',
              fontFamily: mono,
              fontSize: 22,
              fontVariantNumeric: 'tabular-nums',
              lineHeight: '38px',
              whiteSpace: 'pre'
            }}
          >
            {TREE.map(([k, v], i) => (
              <TreeLine index={i} k={k} key={k} v={v} />
            ))}
          </div>
        </Glass>
      </div>
      <div
        style={{
          color: '#fff',
          fontFamily: sans,
          fontSize: 44,
          fontWeight: 450,
          left: 0,
          opacity: captionIn,
          position: 'absolute',
          right: 0,
          textAlign: 'center',
          textShadow: '0 4px 30px rgba(0,0,0,0.35)',
          textWrap: 'balance',
          top: 870
        }}
      >
        One line. Every field. Why it failed and what to do.
      </div>
    </AbsoluteFill>
  )
}

export const Act3Reveal = ({ end }: { end: number }) => (
  <AbsoluteFill style={{ background: black }}>
    <Orb exitAt={STAGE_AT + sec(0.2)} />
    <Stage exitAt={end} />
  </AbsoluteFill>
)
