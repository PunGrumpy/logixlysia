import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { notFound } from 'next/navigation'
import { ImageResponse } from 'next/og'
import type { CSSProperties } from 'react'
import { source } from '@/lib/source'

const ogContainerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  width: '100%',
  height: '100%',
  backgroundColor: '#101010',
  padding: 48,
  color: '#fff'
}

const ogBodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column'
}

const ogTitleStyle: CSSProperties = {
  maxWidth: 768,
  fontSize: 64,
  lineHeight: '69px',
  letterSpacing: '-0.05em',
  margin: 0
}

const ogAccentStyle: CSSProperties = {
  fontFamily: 'Instrument Serif',
  fontStyle: 'italic',
  color: '#ffc799'
}

const ogDescriptionStyle: CSSProperties = {
  fontFamily: 'Geist',
  fontSize: 24,
  fontWeight: 400,
  lineHeight: 1.5,
  letterSpacing: '-0.05em',
  marginTop: 16,
  marginBottom: 0,
  color: '#99ffe4'
}

const Logo = () => (
  // biome-ignore lint/a11y/noSvgWithoutTitle: Title is not needed
  <svg
    fill="none"
    height={48}
    viewBox="0 0 256 256"
    width={48}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M140.46 47.85C138.09 53.12 136.21 58.58 134.88 64H114.24C112.88 58.47 110.96 52.92 108.52 47.54L80.25 40.19L52.52 47.49C47.41 58.73 44.64 71.11 44.64 83.36V145.52C44.64 149.12 41.76 152 38.16 152H21.04C17.76 152 15.36 155.2 16.24 158.4C17.17 161.69 18.24 164.91 19.45 168.07L124.68 206.84L229.83 168.06C231.04 164.91 232.11 161.68 233.04 158.4C233.92 155.2 231.52 152 228.16 152H211.04C207.44 152 204.56 149.12 204.56 145.52V83.36C204.56 71.3 201.86 59.08 196.86 47.94L168.33 40.19L140.46 47.85Z"
      fill="#FF822D"
    />
    <path
      d="M81.52 31.84C92 41.2 99.36 53.52 102.64 67.04C83.28 72.56 66.96 85.12 56.56 101.92V83.2C56.56 63.44 65.04 44.88 79.52 31.84C80.08 31.36 80.96 31.36 81.52 31.84Z"
      fill="#FF6723"
    />
    <path
      d="M192.56 83.36V101.84C182.24 85.12 165.84 72.56 146.4 67.04C149.68 53.52 156.96 41.28 167.44 31.92C168 31.44 168.88 31.44 169.44 31.92C184.08 44.88 192.56 63.52 192.56 83.36Z"
      fill="#FF6723"
    />
    <path
      d="M229.84 167.92H178.16C164.16 167.92 150.48 172.32 139.12 180.48L124.64 190.8L110.16 180.48C98.8 172.32 85.12 167.92 71.12 167.92H19.36C35.44 210.08 76.24 240 124 240H124.56H125.12C172.96 239.92 213.76 210 229.84 167.92Z"
      fill="#FFDEA7"
    />
    <path
      d="M108.64 47.6C103.44 36.16 95.84 25.6 86.32 17.92C84.72 16.64 82.72 16 80.72 16C78.72 16 76.72 16.64 75.12 17.92C65.44 25.68 57.68 36 52.48 47.6H108.64Z"
      fill="#212121"
    />
    <path
      d="M174.08 17.92C172.48 16.64 170.48 16 168.48 16C166.48 16 164.48 16.64 162.88 17.92C153.28 25.68 145.6 36.4 140.4 48H196.96C191.68 36.24 183.92 25.76 174.08 17.92Z"
      fill="#212121"
    />
    <path
      d="M88 144C88 139.58 91.58 136 96 136C100.42 136 104 139.58 104 144V152C104 156.42 100.42 160 96 160C91.58 160 88 156.42 88 152V144Z"
      fill="#212121"
    />
    <path
      d="M144 144C144 139.58 147.58 136 152 136C156.42 136 160 139.58 160 144V152C160 156.42 156.42 160 152 160C147.58 160 144 156.42 144 152V144Z"
      fill="#212121"
    />
    <path
      d="M124.64 205.04C128.96 211.6 136.48 216 144.96 216C147.12 216 148.88 214.24 148.88 212C148.88 209.76 147.12 208 144.88 208C135.92 208 128.56 200.72 128.56 191.68C128.56 191.03 128.41 190.41 128.14 189.87C128.63 189.58 129.1 189.22 129.52 188.8L138.56 179.76C142.96 175.36 139.84 167.92 133.68 167.92H115.6C109.36 167.92 106.24 175.36 110.64 179.76L119.68 188.8C120.09 189.21 120.53 189.55 121 189.84C120.72 190.38 120.56 191.01 120.56 191.68C120.56 200.64 113.28 208 104.24 208C102 208 100.24 209.76 100.24 212C100.24 214.24 102 216 104.24 216C112.72 216 120.24 211.6 124.64 205.04Z"
      fill="#212121"
    />
  </svg>
)

export const GET = async (
  _req: Request,
  { params }: RouteContext<'/og/[...slug]'>
) => {
  const { slug } = await params
  const page = source.getPage(slug)

  if (!page) {
    notFound()
  }

  const [instrumentSerifRegular, instrumentSerifItalic, geistRegular] =
    await Promise.all([
      readFile(join(process.cwd(), 'app/og/[...slug]/InstrumentSerif-Regular.ttf')),
      readFile(join(process.cwd(), 'app/og/[...slug]/InstrumentSerif-Italic.ttf')),
      readFile(join(process.cwd(), 'app/og/[...slug]/Geist-Regular.ttf'))
    ])

  return new ImageResponse(
    <div style={ogContainerStyle}>
      <Logo />
      <div style={ogBodyStyle}>
        <h1 style={ogTitleStyle}>
          {page.data.title} |&nbsp;
          <span style={ogAccentStyle}>
            Logixlysia
          </span>
        </h1>
        <p style={ogDescriptionStyle}>
          {page.data.description}
        </p>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: 'Instrument Serif',
          data: instrumentSerifRegular,
          style: 'normal',
          weight: 400
        },
        {
          name: 'Instrument Serif',
          data: instrumentSerifItalic,
          style: 'italic',
          weight: 400
        },
        {
          name: 'Geist',
          data: geistRegular,
          style: 'normal',
          weight: 400
        }
      ]
    }
  )
}

export const generateStaticParams = () =>
  source.generateParams().map(page => ({
    ...page,
    slug: [...page.slug, 'image.png']
  }))
