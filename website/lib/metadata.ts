import type { Metadata } from 'next'

const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : 'http://localhost:3000'

export const createMetadata = (
  title: string,
  description: string
): Metadata => ({
  title,
  description,
  metadataBase: new URL(baseUrl),
  authors: [
    {
      name: 'Noppakorn Kaewsalabnil',
      url: 'https://www.pungrumpy.com'
    }
  ],
  formatDetection: {
    telephone: false
  },
  creator: 'Noppakorn Kaewsalabnil',
  keywords: [
    'web',
    'logging',
    'logger',
    'elysia',
    'elysiajs',
    'logixlysia',
    'middleware'
  ],
  openGraph: {
    title,
    description,
    siteName: 'Logixlysia',
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: new URL('/opengraph-image.png', baseUrl).toString(),
        width: 1200,
        height: 630
      }
    ]
  },
  twitter: {
    title,
    description,
    creator: '@pungrumpy',
    card: 'summary_large_image',
    images: [
      {
        url: new URL('/opengraph-image.png', baseUrl).toString(),
        width: 1200,
        height: 630
      }
    ]
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default'
  }
})
