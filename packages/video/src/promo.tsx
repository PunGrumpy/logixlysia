import { AbsoluteFill, Sequence } from 'remotion'
import { Fonts } from './lib/fonts'
import { black, sec } from './lib/theme'
import { Act1Scatter } from './scenes/act1-scatter'
import { Act2Noise } from './scenes/act2-noise'
import { Act3Reveal } from './scenes/act3-reveal'
import { Act4Outro } from './scenes/act4-outro'

/**
 * Scene boundaries in seconds. Each wipe finishes exactly on its boundary and
 * the next act opens on the same full-bleed field, so the cut is invisible.
 */
export const T = {
  act1: 0,
  act2: 7,
  act3: 12,
  act4: 23.5,
  end: 31
}

export const PROMO_DURATION = sec(T.end)

export const Promo = () => (
  <AbsoluteFill
    style={{
      background: black,
      MozOsxFontSmoothing: 'grayscale',
      WebkitFontSmoothing: 'antialiased'
    }}
  >
    <Fonts />
    <Sequence
      durationInFrames={sec(T.act2 - T.act1) + 1}
      from={sec(T.act1)}
      name="scatter"
    >
      <Act1Scatter wipeEnd={sec(T.act2 - T.act1)} />
    </Sequence>
    <Sequence
      durationInFrames={sec(T.act3 - T.act2) + 1}
      from={sec(T.act2)}
      name="noise"
    >
      <Act2Noise wipeEnd={sec(T.act3 - T.act2)} />
    </Sequence>
    <Sequence
      durationInFrames={sec(T.act4 - T.act3) + 1}
      from={sec(T.act3)}
      name="reveal"
    >
      <Act3Reveal end={sec(T.act4 - T.act3)} />
    </Sequence>
    <Sequence
      durationInFrames={sec(T.end - T.act4)}
      from={sec(T.act4)}
      name="outro"
    >
      <Act4Outro />
    </Sequence>
  </AbsoluteFill>
)
