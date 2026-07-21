import { defineConfig } from 'blume'

export default defineConfig({
  title: 'Logixlysia',
  description:
    'The logger for Elysia.js — simple and easy to use, beautiful and powerful',
  logo: {
    image: '/icon.png',
    text: 'Logixlysia',
    href: '/'
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
  deployment: {
    adapter: 'vercel'
  }
})
