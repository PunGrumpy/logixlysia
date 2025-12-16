import { createMDX } from 'fumadocs-mdx/next'
import type { NextConfig } from 'next'

const withMDX = createMDX()

const config: NextConfig = {
  reactStrictMode: true,

  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: []
  }
}

export default withMDX(config)
