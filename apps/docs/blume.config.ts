import { defineConfig } from "blume";

// The pre-blume site (Next.js + Fumadocs) served every docs page from the
// root, e.g. /introduction and /features/log-levels. Those URLs are indexed
// and linked externally, so each one 301s to its /docs counterpart.
const legacyDocsPaths = [
  "api-reference",
  "comparison",
  "configuration",
  "contributing",
  "examples",
  "faq",
  "introduction",
  "migration-from-evlog",
  "usage",
  "features/file-logging",
  "features/filtering",
  "features/formatting",
  "features/log-levels",
  "features/log-rotation",
  "features/presets",
  "features/request-context",
  "features/request-id",
  "features/startup",
  "features/transports",
  "features/websocket",
  "integrations/ai",
  "integrations/otel",
  "integrations/pino",
];

export default defineConfig({
  analytics: {
    scripts: [
      {
        attributes: {
          "data-client-id": "da244eb8-365e-4cc4-a869-8fdc146ea465",
          "data-track-attributes": "true",
          "data-track-errors": "true",
          "data-track-hash-changes": "true",
          "data-track-interactions": "true",
          "data-track-outgoing-links": "true",
          "data-track-web-vitals": "true",
        },
        src: "https://cdn.databuddy.cc/databuddy.js",
        strategy: "async",
      },
    ],
  },
  content: {
    sources: [
      { prefix: "docs", root: "content", type: "filesystem" },
      // Logixlysia's GitHub releases become the changelog timeline at /changelog
      // (each release is a type:changelog entry). Set GITHUB_TOKEN in CI to
      // avoid rate limits; a failed fetch degrades to an empty changelog.
      {
        owner: "eastgold15",
        prefix: "changelog",
        repo: "logixlysia",
        type: "github-releases",
      },
    ],
  },
  deployment: {
    adapter: "vercel",
  },
  description:
    "The logger for Elysia.js — simple and easy to use, beautiful and powerful",
  github: {
    owner: "eastgold15",
    repo: "logixlysia",
  },
  lastModified: true,
  logo: {
    href: "/",
    image: "/icon.png",
    text: "Logixlysia",
  },
  markdown: {
    codeBlocks: {
      theme: {
        dark: "vesper",
        light: "github-light",
      },
    },
  },
  navigation: {
    repo: true,
    tabs: [
      {
        label: "Docs",
        path: "/docs",
      },
      {
        label: "Changelog",
        path: "/changelog",
      },
    ],
  },
  // All redirects live here (not vercel.json): the Vercel adapter emits its
  // own Build Output config, which takes precedence over vercel.json routing.
  redirects: [
    ...legacyDocsPaths.map((path) => ({
      from: `/${path}`,
      to: `/docs/${path}`,
    })),
    { from: "/rss.xml", to: "/changelog/rss.xml" },
    { from: "/2025", to: "/2026" },
  ],
  theme: {
    accent: {
      dark: "oklch(0.68 0.15 45.2)",
      light: "oklch(0.54 0.15 45.2)",
    },
    background: {
      dark: "oklch(0.14 0 0)",
      light: "oklch(1 0 0)",
    },
    fonts: {
      body: "geist",
      mono: "geist-mono",
    },
  },
  title: "Logixlysia",
});
