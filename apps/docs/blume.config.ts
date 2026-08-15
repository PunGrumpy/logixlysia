import { defineConfig } from "blume";

// The pre-blume site (Next.js + Fumadocs) served every docs page from the
// root, e.g. /introduction and /features/log-levels. Those URLs are indexed
// and linked externally, so each one 301s to its /docs counterpart.
//
// `api-reference` was a hand-written page; the auto-generated reference
// (typedoc) now lives at `/api` (a top-level "API" tab) and we keep 301s
// from `/api-reference` and the older `/docs/reference` and `/docs/api`
// for SEO continuity.
const legacyDocsPaths = [
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
    // Two filesystem sources split the same `content/` tree. Blume resolves
    // entry IDs as `relative(collectionBase, sourcePath)`, where collectionBase
    // for >1 filesystem source is `content.root` (set to "content" here). Every
    // source must therefore also root at `content/`, and the per-source
    // `include` globs partition ownership. The api source has no `prefix`, so
    // its `ref` (e.g. `api/configuration.mdx`) is used as-is → route
    // `/api/configuration` after `mapRoute`. The docs source uses prefix
    // `docs` so `comparison.mdx` → `/docs/comparison`. The api tab path
    // `/api` resolves to `api/index.mdx` via the docs-collection glob loader,
    // whose base is the shared `content/` directory.
    root: "content",
    sources: [
      // Hand-written guide under /docs. Excludes the `api/` subdirectory and
      // `meta.ts` so each file is owned by exactly one source and meta
      // files don't become pages.
      {
        exclude: ["**/meta.ts"],
        include: ["!(api)/**"],
        prefix: "docs",
        root: "content",
        type: "filesystem",
      },
      // Auto-generated API reference (typedoc) lives at /api, separate
      // from the hand-written guide at /docs — different ownership,
      // different review cadence, different failure mode. No prefix: the
      // api/ folder is already in the ref, so we don't want it doubled.
      {
        exclude: ["**/meta.ts"],
        include: ["api/**"],
        root: "content",
        type: "filesystem",
      },
      // Elogs's GitHub releases become the changelog timeline at /changelog
      // (each release is a type:changelog entry). Set GITHUB_TOKEN in CI to
      // avoid rate limits; a failed fetch degrades to an empty changelog.
      {
        owner: "eastgold15",
        prefix: "changelog",
        repo: "elogs",
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
    repo: "elogs",
  },
  lastModified: true,
  logo: {
    href: "/",
    image: "/icon.png",
    text: "Elogs",
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
        label: "API",
        path: "/api",
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
    { from: "/api-reference", to: "/api" },
    { from: "/docs/api", to: "/api" },
    { from: "/docs/reference", to: "/api" },
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
      // Self-hosted via @fontsource(-variable)/*. The build sandbox has no
      // access to fonts.google.com, and unifont's google/fontsource providers
      // both hit remote metadata APIs at build time. Local variants embed
      // the woff2 files directly so no network is needed. Paths resolve
      // against `apps/docs/` (blume's project root).
      body: {
        fallback: "sans",
        name: "Inter",
        variants: [
          {
            src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
            style: "normal",
            weight: "100..900",
          },
          {
            src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-italic.woff2",
            style: "italic",
            weight: "100..900",
          },
        ],
      },
      display: {
        fallback: "sans",
        name: "Inter Tight",
        variants: [
          {
            src: "../../node_modules/@fontsource-variable/inter-tight/files/inter-tight-latin-wght-normal.woff2",
            style: "normal",
            weight: "100..900",
          },
          {
            src: "../../node_modules/@fontsource-variable/inter-tight/files/inter-tight-latin-wght-italic.woff2",
            style: "italic",
            weight: "100..900",
          },
        ],
      },
      mono: {
        fallback: "mono",
        name: "IBM Plex Mono",
        variants: [400, 500, 600, 700].flatMap((w) => [
          {
            src: `../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-${w}-normal.woff2`,
            style: "normal",
            weight: String(w),
          },
          {
            src: `../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-${w}-italic.woff2`,
            style: "italic",
            weight: String(w),
          },
        ]),
      },
    },
  },
  title: "Elogs",
});
