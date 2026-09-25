import { useEffect, useRef } from 'react'
import { continueRender, delayRender, staticFile } from 'remotion'

const css = `
@font-face {
  font-family: 'Inter';
  src: url('${staticFile('fonts/Inter.ttf')}') format('truetype');
  font-weight: 100 900;
  font-display: block;
}
@font-face {
  font-family: 'JetBrains Mono';
  src: url('${staticFile('fonts/JetBrainsMono-Medium.ttf')}') format('truetype');
  font-weight: 500;
  font-display: block;
}
@font-face {
  font-family: 'JetBrains Mono';
  src: url('${staticFile('fonts/JetBrainsMono-Bold.ttf')}') format('truetype');
  font-weight: 700;
  font-display: block;
}
`

const waitForFonts = async (
  loads: Promise<unknown>[],
  handle: number
): Promise<void> => {
  try {
    await Promise.all(loads)
  } catch {
    // A font that fails to load falls back; render anyway.
  }
  continueRender(handle)
}

/** Injects the bundled fonts and holds the render until the browser has them. */
export const Fonts = () => {
  // Created once, on first render, like a `useState` initializer.
  const handleRef = useRef<number | null>(null)
  if (handleRef.current === null) {
    handleRef.current = delayRender('fonts')
  }

  useEffect(() => {
    const handle = handleRef.current
    if (handle === null) {
      return
    }
    const style = document.createElement('style')
    style.textContent = css
    document.head.append(style)
    const loads = [
      document.fonts.load("400 40px 'Inter'"),
      document.fonts.load("600 40px 'Inter'"),
      document.fonts.load("500 20px 'JetBrains Mono'"),
      document.fonts.load("700 20px 'JetBrains Mono'")
    ]
    waitForFonts(loads, handle)
    return () => {
      style.remove()
    }
  }, [])

  return null
}
