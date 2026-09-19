import { Composition } from 'remotion'
import { FPS } from './lib/theme'
import { PROMO_DURATION, Promo } from './promo'

const WIDTH = 1920
const HEIGHT = 1080

export const RemotionRoot = () => (
  <Composition
    component={Promo}
    durationInFrames={PROMO_DURATION}
    fps={FPS}
    height={HEIGHT}
    id="Promo"
    width={WIDTH}
  />
)
