import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig
} from 'remotion'
import { mono, ringDark, sans, sec } from '../lib/theme'
import { BlockWipe, Glass, Grain, Halftone, Pop, progress } from '../lib/ui'
import { NoiseField } from './act1-scatter'

/**
 * Act 2: the noisy terminal. Over the halftone field a dark terminal window
 * drifts in (the reference's product-on-halftone shot) and fills with the
 * scattered lines nobody can read at 3 AM. A frosted pill labels the moment.
 */

const LINES = [
  ['12:03:41.002', 'info', 'Request received'],
  ['12:03:41.004', 'debug', 'Resolving session'],
  ['12:03:41.011', 'info', 'User: 8213'],
  ['12:03:41.038', 'info', 'Cart loaded (3 items)'],
  ['12:03:41.040', 'debug', 'Validating address'],
  ['12:03:41.062', 'info', 'Charging card'],
  ['12:03:41.071', 'warn', 'Gateway slow (412ms)'],
  ['12:03:41.480', 'info', 'Retrying'],
  ['12:03:41.902', 'error', 'Something went wrong'],
  ['12:03:41.903', 'info', 'Done']
] as const

const LEVEL_COLOR: Record<string, string> = {
  debug: '#8d8d8d',
  error: '#ff6b6b',
  info: '#7fb2ff',
  warn: '#ffc857'
}

const LINE_FADE_FRAMES = 6
const FIRST_LINE_DELAY = 0.35
const LINE_GAP = 0.19
const WIPE_SECONDS = 1

/** The hot field the wipe reveals and Act 3 opens on. */
export const HotField = ({ dots = 1 }: { dots?: number }) => (
  <AbsoluteFill
    style={{
      background:
        'radial-gradient(110% 80% at 70% 30%, #ffb35c 0%, #f26a3d 40%, #c22e2e 75%, #7a1b2e 100%)'
    }}
  >
    <Halftone color="rgba(255,220,180,0.35)" dot={6} opacity={dots} size={16} />
  </AbsoluteFill>
)

const Terminal = ({ at }: { at: number }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = spring({
    config: { damping: 200, mass: 1.2, stiffness: 70 },
    fps,
    frame: frame - at
  })
  const y = interpolate(enter, [0, 1], [70, 0])
  const rot = interpolate(enter, [0, 1], [3, -2])
  const sway = Math.sin(frame / 40) * 0.6
  return (
    <div
      style={{
        background: '#0d0f12',
        borderRadius: 18,
        boxShadow: `${ringDark}, 0 60px 120px rgba(0,0,0,0.45)`,
        left: 460,
        opacity: enter,
        overflow: 'hidden',
        position: 'absolute',
        top: 200,
        transform: `translateY(${y}px) rotate(${rot + sway}deg) perspective(1600px) rotateY(-6deg)`,
        width: 1000
      }}
    >
      <div
        style={{
          alignItems: 'center',
          background: '#15181d',
          display: 'flex',
          gap: 8,
          height: 44,
          padding: '0 16px'
        }}
      >
        {['#ff5f57', '#febc2e', '#28c840'].map(c => (
          <span
            key={c}
            style={{
              background: c,
              borderRadius: 6,
              height: 12,
              width: 12
            }}
          />
        ))}
        <span
          style={{
            color: 'rgba(255,255,255,0.45)',
            fontFamily: sans,
            fontSize: 14,
            marginLeft: 12
          }}
        >
          api-server — production
        </span>
      </div>
      <div
        style={{
          fontFamily: mono,
          fontSize: 20,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: '34px',
          padding: '18px 22px 24px'
        }}
      >
        {LINES.map(([ts, level, msg], i) => {
          const lineAt = at + sec(FIRST_LINE_DELAY) + i * sec(LINE_GAP)
          if (frame < lineAt) {
            return null
          }
          const t = progress(frame, lineAt, lineAt + LINE_FADE_FRAMES)
          return (
            <div
              key={ts}
              style={{
                display: 'flex',
                gap: 16,
                opacity: t,
                transform: `translateY(${(1 - t) * 6}px)`,
                whiteSpace: 'pre'
              }}
            >
              <span style={{ color: 'rgba(255,255,255,0.35)' }}>{ts}</span>
              <span style={{ color: LEVEL_COLOR[level], width: 70 }}>
                {level.toUpperCase()}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.86)' }}>{msg}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const Act2Noise = ({ wipeEnd }: { wipeEnd: number }) => {
  const frame = useCurrentFrame()
  const wipe = progress(frame, wipeEnd - sec(WIPE_SECONDS), wipeEnd, t => t)
  return (
    <AbsoluteFill>
      <NoiseField />
      <Terminal at={sec(0.1)} />
      <Pop
        at={sec(0.5)}
        from={0.9}
        style={{ left: 1330, position: 'absolute', top: 150 }}
      >
        <Glass
          radius={999}
          style={{ padding: '14px 26px' }}
          tint="rgba(255,255,255,0.18)"
        >
          <span
            style={{
              color: '#fff',
              fontFamily: sans,
              fontSize: 22,
              fontWeight: 500,
              letterSpacing: 0.5
            }}
          >
            3:12 AM · PAGER
          </span>
        </Glass>
      </Pop>
      <Pop
        at={sec(2.9)}
        style={{
          left: 0,
          position: 'absolute',
          right: 0,
          textAlign: 'center',
          top: 860
        }}
      >
        <span
          style={{
            color: '#fff',
            fontFamily: sans,
            fontSize: 52,
            fontWeight: 450,
            letterSpacing: -1,
            textWrap: 'balance'
          }}
        >
          Good luck finding the one that mattered.
        </span>
      </Pop>
      <Grain opacity={0.07} />
      <BlockWipe cell={70} from="bottom-right" id="wipe2" t={wipe}>
        <HotField />
      </BlockWipe>
    </AbsoluteFill>
  )
}
