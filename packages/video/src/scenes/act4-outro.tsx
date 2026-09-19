import {
  AbsoluteFill,
  Img,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig
} from 'remotion'
import { black, fox, mono, sans, sec } from '../lib/theme'
import { Glass, Grain, progress, useFade, useFadeOut } from '../lib/ui'

/**
 * Act 4: black outro. Tagline, three glass feature cards with gradient blobs,
 * then the wordmark, install line and URL, mirroring the reference's ending.
 */

const TAGLINE_AT = sec(0.2)
const CARDS_AT = sec(1.6)
const LOGO_AT = sec(4.6)
const CARD_STAGGER = sec(0.1)
const LOGO_STAGGER = sec(0.1)
const EXIT_RISE_PX = 8

interface Card {
  blob: string
  body: string
  title: string
}

const CARDS: Card[] = [
  {
    blob: '#5cb8ff',
    body: 'Axiom, Datadog, Loki, Sentry, PostHog, OTLP and more',
    title: 'Nine destinations'
  },
  {
    blob: '#b9e36b',
    body: 'Keep 10% of the noise, rescue every slow or failed request',
    title: 'Head + tail sampling'
  },
  {
    blob: '#ffb35c',
    body: 'Emails, cards, tokens and query secrets masked before they leave',
    title: 'Redaction built in'
  }
]

const CardEl = ({ c, i }: { c: Card; i: number }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const at = CARDS_AT + i * CARD_STAGGER
  const s = spring({
    config: { damping: 200, stiffness: 90 },
    fps,
    frame: frame - at
  })
  const out = useFadeOut(LOGO_AT - sec(0.1), sec(0.4))
  if (frame < at) {
    return null
  }
  // Enter rises 30px; the exit lifts only 8px so it reads softer than the enter.
  const y = (1 - s) * 30 - (1 - out) * EXIT_RISE_PX
  return (
    <div style={{ opacity: s * out, transform: `translateY(${y}px)` }}>
      <Glass
        radius={26}
        style={{
          height: 260,
          overflow: 'hidden',
          position: 'relative',
          width: 460
        }}
        tint="rgba(255,255,255,0.06)"
      >
        <div
          style={{
            background: c.blob,
            borderRadius: '50%',
            filter: 'blur(70px)',
            height: 200,
            left: 80,
            opacity: 0.55,
            position: 'absolute',
            top: 60,
            width: 320
          }}
        />
        <div style={{ bottom: 32, left: 32, position: 'absolute', right: 32 }}>
          <div
            style={{
              color: '#fff',
              fontFamily: sans,
              fontSize: 28,
              fontWeight: 550,
              marginBottom: 8
            }}
          >
            {c.title}
          </div>
          <div
            style={{
              color: 'rgba(255,255,255,0.7)',
              fontFamily: sans,
              fontSize: 19,
              lineHeight: '26px'
            }}
          >
            {c.body}
          </div>
        </div>
      </Glass>
    </div>
  )
}

export const Act4Outro = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const tagIn = useFade(TAGLINE_AT, 14)
  const tagOut = useFadeOut(CARDS_AT + sec(0.1), sec(0.4))
  const logo = spring({
    config: { damping: 200, stiffness: 60 },
    fps,
    frame: frame - LOGO_AT
  })
  // The outro is split into four chunks that land 100 ms apart.
  const subtitleIn = progress(
    frame,
    LOGO_AT + LOGO_STAGGER,
    LOGO_AT + LOGO_STAGGER + 14
  )
  const installIn = progress(
    frame,
    LOGO_AT + LOGO_STAGGER * 2,
    LOGO_AT + LOGO_STAGGER * 2 + 14
  )
  const urlIn = progress(
    frame,
    LOGO_AT + LOGO_STAGGER * 3,
    LOGO_AT + LOGO_STAGGER * 3 + 14
  )
  return (
    <AbsoluteFill style={{ background: black }}>
      <div
        style={{
          color: '#fff',
          fontFamily: sans,
          fontSize: 46,
          fontWeight: 450,
          left: 0,
          opacity: tagIn * tagOut,
          position: 'absolute',
          right: 0,
          textAlign: 'center',
          textWrap: 'balance',
          top: 505,
          transform: `translateY(${-EXIT_RISE_PX * (1 - tagOut)}px)`
        }}
      >
        Stop digging through logs.
      </div>
      <div
        style={{
          display: 'flex',
          gap: 30,
          justifyContent: 'center',
          left: 0,
          position: 'absolute',
          right: 0,
          top: 410
        }}
      >
        {CARDS.map((c, i) => (
          <CardEl c={c} i={i} key={c.title} />
        ))}
      </div>
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          flexDirection: 'column',
          left: 0,
          opacity: logo,
          position: 'absolute',
          right: 0,
          top: 430,
          transform: `scale(${0.96 + 0.04 * logo})`
        }}
      >
        <div style={{ alignItems: 'center', display: 'flex', gap: 22 }}>
          <Img src={staticFile('icon.png')} style={{ height: 84, width: 84 }} />
          <span
            style={{
              color: '#fff',
              fontFamily: sans,
              fontSize: 84,
              fontWeight: 550,
              letterSpacing: -3
            }}
          >
            logixlysia
          </span>
        </div>
        <div
          style={{
            color: 'rgba(255,255,255,0.55)',
            fontFamily: sans,
            fontSize: 24,
            marginTop: 10,
            opacity: subtitleIn,
            transform: `translateY(${(1 - subtitleIn) * 8}px)`
          }}
        >
          Observability-first logging for Elysia
        </div>
        <div
          style={{
            alignItems: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            marginTop: 44
          }}
        >
          <div
            style={{
              opacity: installIn,
              transform: `translateY(${(1 - installIn) * 8}px)`
            }}
          >
            <Glass
              radius={14}
              style={{ padding: '14px 26px' }}
              tint="rgba(255,255,255,0.06)"
            >
              <span style={{ color: '#fff', fontFamily: mono, fontSize: 26 }}>
                <span style={{ color: fox }}>$ </span>
                bun add logixlysia
              </span>
            </Glass>
          </div>
          <span
            style={{
              color: 'rgba(255,255,255,0.45)',
              fontFamily: sans,
              fontSize: 20,
              opacity: urlIn,
              transform: `translateY(${(1 - urlIn) * 8}px)`
            }}
          >
            logixlysia.vercel.app
          </span>
        </div>
      </div>
      <Grain opacity={0.06} />
    </AbsoluteFill>
  )
}
