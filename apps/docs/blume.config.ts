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

// Mintlify's assistant widget, embedded on the Blume site. Blume stays the
// documentation itself; Mintlify only supplies the AI chat, trained on the
// same `content/` tree it deploys from (see content/docs.json). Unset the
// env var and nothing is injected — the widget is additive, never required.
//
// The ID is a public token from the deployment's Widget settings page, but it
// is interpolated into a script body below, so it is checked against the
// character set Mintlify issues rather than trusted. Anything else is a
// misconfigured environment, and failing the build beats shipping the
// interpolation.
const mintlifyWidgetId = process.env.MINTLIFY_WIDGET_ID?.trim()

if (mintlifyWidgetId && !/^[\w-]+$/.test(mintlifyWidgetId)) {
  throw new Error(
    'MINTLIFY_WIDGET_ID must be the plain widget ID from the Mintlify dashboard (letters, digits, "_" and "-" only).'
  )
}

// Two module scripts, in the order Mintlify requires: the loader registers
// `window.MintlifyAssistant`, then the initializer mounts it. Blume emits
// every `src` script before every `content` script, so this order holds
// regardless of how the array below is written.
const mintlifyWidgetScripts = mintlifyWidgetId
  ? [
      {
        attributes: { type: 'module' },
        src: 'https://widget.mintlify.com/v1/embed.js'
      },
      {
        attributes: { type: 'module' },
        content: `await window.MintlifyAssistant.init(${JSON.stringify({
          appearance: {
            accent: 'oklch(0.68 0.15 45.2)',
            theme: 'system',
            variant: 'panel'
          },
          id: mintlifyWidgetId,
          labels: {
            title: 'Ask Logixlysia',
            trigger: 'Ask AI'
          },
          starterQuestions: [
            'How do I add Logixlysia to an Elysia app?',
            'How do I write logs to a file and rotate them?',
            'How do I filter which requests get logged?'
          ]
        })});`
      }
    ]
  : []

export default defineConfig({
  analytics: {
    scripts: [
      ...mintlifyWidgetScripts,
      {
        attributes: {
          'data-client-id': 'da244eb8-365e-4cc4-a869-8fdc146ea465',
          'data-track-attributes': 'true',
          'data-track-errors': 'true',
          'data-track-hash-changes': 'true',
          'data-track-interactions': 'true',
          'data-track-outgoing-links': 'true',
          'data-track-web-vitals': 'true'
        },
        src: 'https://cdn.databuddy.cc/databuddy.js',
        strategy: 'async'
      }
    ]
  },
  content: {
    sources: [
      { prefix: 'docs', root: 'content', type: 'filesystem' },
      // Logixlysia's GitHub releases become the changelog timeline at /changelog
      // (each release is a type:changelog entry). Set GITHUB_TOKEN in CI to
      // avoid rate limits; a failed fetch degrades to an empty changelog.
      {
        owner: 'PunGrumpy',
        prefix: 'changelog',
        repo: 'logixlysia',
        type: 'github-releases'
      }
    ]
  },
  deployment: {
    adapter: 'vercel'
  },
  description:
    'The logger for Elysia.js — simple and easy to use, beautiful and powerful',
  github: {
    owner: 'PunGrumpy',
    repo: 'logixlysia'
  },
  lastModified: true,
  logo: {
    href: '/',
    image: '/icon.png',
    text: 'Logixlysia'
  },
  markdown: {
    codeBlocks: {
      theme: {
        dark: 'vesper',
        light: 'github-light'
      }
    }
  },
  navigation: {
    repo: true,
    tabs: [
      {
        label: 'Docs',
        path: '/docs'
      },
      {
        label: 'Changelog',
        path: '/changelog'
      }
    ]
  },
  // All redirects live here (not vercel.json): the Vercel adapter emits its
  // own Build Output config, which takes precedence over vercel.json routing.
  redirects: [
    ...legacyDocsPaths.map(path => ({
      from: `/${path}`,
      to: `/docs/${path}`
    })),
    { from: '/rss.xml', to: '/changelog/rss.xml' },
    { from: '/2025', to: '/2026' }
  ],
  theme: {
    accent: {
      dark: 'oklch(0.68 0.15 45.2)',
      light: 'oklch(0.54 0.15 45.2)'
    },
    background: {
      dark: 'oklch(0.14 0 0)',
      light: 'oklch(1 0 0)'
    },
    fonts: {
      body: 'geist',
      mono: 'geist-mono'
    }
  },
  title: 'Logixlysia'
})
