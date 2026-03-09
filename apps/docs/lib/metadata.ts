import type { Metadata } from "next";

const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

export const createMetadata = (
  title: string,
  description: string
): Metadata => ({
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
  },
  authors: [
    {
      name: "Noppakorn Kaewsalabnil",
      url: "https://www.pungrumpy.com",
    },
  ],
  creator: "Noppakorn Kaewsalabnil",
  description,
  formatDetection: {
    telephone: false,
  },
  keywords: [
    "web",
    "logging",
    "logger",
    "elysia",
    "elysiajs",
    "logixlysia",
    "middleware",
  ],
  metadataBase: new URL(baseUrl),
  openGraph: {
    description,
    images: [
      {
        height: 630,
        url: new URL("/opengraph-image.png", baseUrl).toString(),
        width: 1200,
      },
    ],
    locale: "en_US",
    siteName: "Logixlysia",
    title,
    type: "website",
  },
  title,
  twitter: {
    card: "summary_large_image",
    creator: "@pungrumpy",
    description,
    images: [
      {
        height: 630,
        url: new URL("/opengraph-image.png", baseUrl).toString(),
        width: 1200,
      },
    ],
    title,
  },
});
