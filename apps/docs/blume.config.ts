import { defineConfig } from 'blume'
import { databuddy, script } from 'blume/analytics'
import { vercel } from 'blume/deploy'
import { filesystem, githubReleases } from 'blume/sources'

// The old Fumadocs site served docs from the root (/introduction). Those URLs
// are indexed and linked elsewhere, so each one redirects to /docs/<path>.
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

// Optional Mintlify AI chat widget. Without MINTLIFY_WIDGET_ID nothing is
// injected. The ID goes into an inline script, so the build rejects any
// character Mintlify does not issue.
const mintlifyWidgetId = process.env.MINTLIFY_WIDGET_ID?.trim()

if (mintlifyWidgetId && !/^[\w-]+$/u.test(mintlifyWidgetId)) {
  throw new Error(
    'MINTLIFY_WIDGET_ID must be the plain widget ID from the Mintlify dashboard (letters, digits, "_" and "-" only).'
  )
}

// Blume emits analytics tags in list order. The loader must come before the
// init script, which calls `window.MintlifyAssistant`.
const mintlifyWidgetScripts = mintlifyWidgetId
  ? [
      script({
        attributes: { type: 'module' },
        src: 'https://widget.mintlify.com/v1/embed.js'
      }),
      script({
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
      })
    ]
  : []

export default defineConfig({
  analytics: [
    ...mintlifyWidgetScripts,
    databuddy({
      clientId: 'da244eb8-365e-4cc4-a869-8fdc146ea465',
      'track-attributes': 'true',
      'track-errors': 'true',
      'track-hash-changes': 'true',
      'track-interactions': 'true',
      'track-outgoing-links': 'true',
      'track-web-vitals': 'true'
    })
  ],
  content: {
    sources: [
      filesystem({ prefix: 'docs', root: 'content' }),
      // Set GITHUB_TOKEN in CI. Without it, rate limits can leave /changelog
      // empty.
      githubReleases({
        owner: 'PunGrumpy',
        prefix: 'changelog',
        repo: 'logixlysia'
      })
    ]
  },
  deployment: vercel(),
  description:
    'The logger for Elysia.js — simple and easy to use, beautiful and powerful',
  github: {
    // "Edit this page" links 404 without `dir`, because the content lives
    // in apps/docs, not at the repo root.
    dir: 'apps/docs',
    owner: 'PunGrumpy',
    repo: 'logixlysia'
  },
  lastModified: 'git',
  logo: {
    href: '/',
    image: '/icon.png',
    text: 'Logixlysia'
  },
  markdown: {
    code: {
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
  // Redirects must live here. The Vercel adapter's Build Output config
  // overrides vercel.json routing.
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
