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
      { type: 'filesystem', root: 'content' },
      {
        type: 'github-releases',
        prefix: 'changelog',
        owner: 'PunGrumpy',
        repo: 'logixlysia'
      }
    ]
  },
  theme: {
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
