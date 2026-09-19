import { useEffect, useState } from 'react'
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

/** Injects the bundled fonts and holds the render until the browser has them. */
export const Fonts = () => {
  const [handle] = useState(() => delayRender('fonts'))

  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = css
    document.head.appendChild(style)
    const loads = [
      document.fonts.load("400 40px 'Inter'"),
      document.fonts.load("600 40px 'Inter'"),
      document.fonts.load("500 20px 'JetBrains Mono'"),
      document.fonts.load("700 20px 'JetBrains Mono'")
    ]
    Promise.all(loads)
      .catch(() => undefined)
      .finally(() => continueRender(handle))
    return () => {
      style.remove()
    }
  }, [handle])

  return null
}
