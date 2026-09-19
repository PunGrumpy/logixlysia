export const FPS = 30

export const paper = '#f1f0eb'
export const paperLine = 'rgba(0,0,0,0.085)'
export const ink = '#111111'
export const black = '#050505'
/** The fox orange from the icon; the one accent the brand owns. */
export const fox = '#f26a3d'

/** Shadow-as-border rings (surfaces.md): a 1px ring plus lift, no solid border. */
export const ringLight =
  '0 0 0 1px rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.06), 0 2px 4px 0 rgba(0,0,0,0.04)'
export const ringDark = '0 0 0 1px rgba(255,255,255,0.08)'

/** Level chip colors, mirroring chalk.bgGreen/bgBlue/bgYellow/bgRed in the console. */
export const level = {
  debug: '#3b82f6',
  error: '#ef4444',
  info: '#22c55e',
  warning: '#eab308'
} as const

export const sans = "'Inter', system-ui, -apple-system, sans-serif"
export const mono =
  "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace"

/** Seconds to frames at the composition frame rate. */
export const sec = (s: number): number => Math.round(s * FPS)
