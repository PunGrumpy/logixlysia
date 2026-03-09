import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

const withMDX = createMDX();

const config: NextConfig = {
  experimental: {
    turbopackFileSystemCacheForDev: true,
  },

  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [],
  },

  reactStrictMode: true,

  rewrites() {
    return [
      {
        destination: "/llms.mdx/:path*",
        source: "/:path*.mdx",
      },
    ];
  },
};

export default withMDX(config);
