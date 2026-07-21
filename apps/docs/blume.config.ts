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
  markdown: {
    code: {
      theme: {
        light: 'github-light',
        dark: 'vesper'
      }
    }
  },
  deployment: {
    site: 'https://logixlysia.vercel.app'
  }
})
