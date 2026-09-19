export const FPS = 30

export const paper = '#f1f0eb'
export const paperLine = 'rgba(0,0,0,0.085)'
export const ink = '#111111'
export const black = '#050505'

export const sans = "'Inter', system-ui, -apple-system, sans-serif"
export const mono =
  "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace"

/** Seconds to frames at the composition frame rate. */
export const sec = (s: number): number => Math.round(s * FPS)
