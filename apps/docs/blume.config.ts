import { defineConfig } from 'blume'

// The pre-blume site (Next.js + Fumadocs) served every docs page from the
// root, e.g. /introduction and /features/log-levels. Those URLs are indexed
// and linked externally, so each one 301s to its /docs counterpart.
const legacyDocsPaths = [
  'api-reference',
  'comparison',
  'configuration',
  'contributing',
  'examples',
  'faq',
  'introduction',
  'migration-from-evlog',
  'usage',
  'features/file-logging',
  'features/filtering',
  'features/formatting',
  'features/log-levels',
  'features/log-rotation',
  'features/presets',
  'features/request-context',
  'features/request-id',
  'features/startup',
  'features/transports',
  'features/websocket',
  'integrations/ai',
  'integrations/otel',
  'integrations/pino'
]

export default defineConfig({
  title: 'Logixlysia',
  description:
    'The logger for Elysia.js — simple and easy to use, beautiful and powerful',
  logo: {
    image: '/icon.png',
    text: 'Logixlysia',
    href: '/'
  },
  github: {
    owner: 'PunGrumpy',
    repo: 'logixlysia'
  },
  navigation: {
    tabs: [
      {
        label: 'Docs',
        path: '/docs'
      },
      {
        label: 'Changelog',
        path: '/changelog'
      }
    ],
    repo: true
  },
  content: {
    sources: [
      { prefix: 'docs', root: 'content', type: 'filesystem' },
      // Logixlysia's GitHub releases become the changelog timeline at /changelog
      // (each release is a type:changelog entry). Set GITHUB_TOKEN in CI to
      // avoid rate limits; a failed fetch degrades to an empty changelog.
      {
        type: 'github-releases',
        prefix: 'changelog',
        owner: 'PunGrumpy',
        repo: 'logixlysia'
      }
    ]
  },
  lastModified: true,
  // All redirects live here (not vercel.json): the Vercel adapter emits its
  // own Build Output config, which takes precedence over vercel.json routing.
  redirects: [
    ...legacyDocsPaths.map(path => ({
      from: `/${path}`,
      to: `/docs/${path}`
    })),
    { from: '/rss.xml', to: '/changelog/rss.xml' },
    { from: '/2025', to: '/' }
  ],
  theme: {
    background: {
      light: 'oklch(1 0 0)',
      dark: 'oklch(0.14 0 0)'
    },
    accent: '#b24b0a',
    fonts: {
      body: 'geist',
      mono: 'geist-mono'
    }
  },
  markdown: {
    codeBlocks: {
      theme: {
        light: 'github-light',
        dark: 'vesper'
      }
    }
  },
  analytics: {
    scripts: [
      {
        src: 'https://cdn.databuddy.cc/databuddy.js',
        attributes: {
          'data-client-id': 'da244eb8-365e-4cc4-a869-8fdc146ea465',
          'data-track-hash-changes': 'true',
          'data-track-attributes': 'true',
          'data-track-outgoing-links': 'true',
          'data-track-interactions': 'true',
          'data-track-web-vitals': 'true',
          'data-track-errors': 'true'
        },
        strategy: 'async'
      }
    ]
  },
  deployment: {
    adapter: 'vercel'
  }
})
